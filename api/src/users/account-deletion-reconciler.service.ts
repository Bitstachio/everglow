import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { ApiException } from "src/common/errors/api.exception";
import { PrismaService } from "src/prisma/prisma.service";
import { claimNextPendingDeletion, releaseDeletionClaim } from "./account-deletion-claim";
import { AccountDeletionPreflightService } from "./account-deletion-preflight.service";
import { TOMBSTONE_RETENTION_DAYS, TombstoneRelatedReport, tombstoneExpiresAt } from "./deleted-provider-sub";
import { ACCOUNT_DELETION_RECONCILER_MIN_AGE_MINUTES } from "./users.constants";
import { UsersService } from "./users.service";

export interface AccountDeletionReconcileResult {
  // Users with deletionStartedAt set that this run claimed
  scanned: number;
  // Users whose saga completed (Postgres row gone)
  deleted: number;
  // Users whose saga threw; retried on a later run
  failed: number;
  // Users whose attempt this run failed and whose deletion is older than the stuck threshold (also in failed)
  stuck: number;
  // Users that used up their attempt budget on this run and will not be retried
  abandoned: number;
  // Users skipped because Auth0 or Apple could not be used (ACCOUNT_DELETION_UNAVAILABLE); not an attempt
  unavailable: number;
  // Tombstones past their retention, deleted this run
  tombstonesPurged: number;
}

export interface TombstonePurgeResult {
  purged: number;
  // Tombstones past the base window kept because they carry a suspension or a ban
  sanctionedKept: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Finishes account-deletion sagas left mid-flight after Auth0 was cleared (or
 * deletionStartedAt was set) but the Postgres user row remains.
 *
 * Same family as the photo orphan reconciler: accept a short dual-store gap,
 * find leftovers via a durable marker, heal without needing the user's session.
 */
@Injectable()
export class AccountDeletionReconcilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly preflight: AccountDeletionPreflightService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async reconcilePendingDeletions(now: Date = new Date()): Promise<AccountDeletionReconcileResult> {
    const batchSize = this.configService.getOrThrow<number>("users.accountDeletionReconcilerBatchSize");
    const stuckAfterHours = this.configService.getOrThrow<number>("users.accountDeletionReconcilerStuckAfterHours");
    const maxAttempts = this.configService.getOrThrow<number>("users.accountDeletionMaxAttempts");
    const stuckCutoff = new Date(now.getTime() - stuckAfterHours * HOUR_MS);
    // A deletion younger than this belongs to the request that started it.
    const startedBefore = new Date(now.getTime() - ACCOUNT_DELETION_RECONCILER_MIN_AGE_MINUTES * MINUTE_MS);

    const result: AccountDeletionReconcileResult = {
      scanned: 0,
      deleted: 0,
      failed: 0,
      stuck: 0,
      abandoned: 0,
      unavailable: 0,
      tombstonesPurged: 0,
    };

    // One row at a time, each claimed when its turn comes, so the lease covers
    // the pass that runs it rather than ticking away behind the rest of the
    // batch. Rows that used up the budget are left for a person: re-running
    // them every hour would not fix a failure that is not transient, and the
    // noise trains everyone to ignore the alert that matters.
    const tried: string[] = [];
    while (tried.length < batchSize) {
      const user = await claimNextPendingDeletion(this.prisma, { startedBefore, maxAttempts, skipIds: [...tried] });
      if (!user) break;
      tried.push(user.id);
      result.scanned += 1;

      try {
        await this.preflight.assertCanFinish(user);
      } catch (error) {
        // Nothing about this row is wrong: Auth0 or Apple cannot be used right
        // now, which the unavailable alert already reports. Not an attempt.
        result.unavailable += 1;
        await releaseDeletionClaim(this.prisma, user).catch(() => undefined);
        if (error instanceof ApiException && error.code === "ACCOUNT_DELETION_UNAVAILABLE") continue;
        throw error;
      }

      try {
        // "vanished" is a success too: another pass deleted the row first.
        await this.usersService.completeAccountDeletion(user);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        const attempts = user.deletionAttempts + 1;
        try {
          await this.prisma.user.update({ where: { id: user.id }, data: { deletionAttempts: attempts } });
        } catch {
          // The budget is a guard rail, not the outcome being reported. Losing
          // the counter must not hide the deletion failure below.
        }

        this.logger.error(
          {
            err: error as Error,
            event: "user.account.deletion_reconcile.failed",
            userId: user.id,
            deletionStartedAt: user.deletionStartedAt,
            auth0DeletedAt: user.auth0DeletedAt,
            attempts,
            maxAttempts,
            audit: true,
          },
          "Failed to finish pending account deletion",
        );

        // Stuck only after a failed attempt: a deletion this run finishes is
        // not stuck, however old it was.
        if (user.deletionStartedAt <= stuckCutoff) {
          result.stuck += 1;
          this.logger.warn(
            {
              event: ALERT_EVENTS.ACCOUNT_DELETION_STUCK,
              userId: user.id,
              deletionStartedAt: user.deletionStartedAt,
              auth0DeletedAt: user.auth0DeletedAt,
              attempts,
              stuckAfterHours,
              audit: true,
            },
            "Account deletion saga still pending past stuck threshold",
          );
        }

        if (attempts >= maxAttempts) {
          result.abandoned += 1;
          this.logger.error(
            {
              event: ALERT_EVENTS.ACCOUNT_DELETION_ABANDONED,
              userId: user.id,
              deletionStartedAt: user.deletionStartedAt,
              auth0DeletedAt: user.auth0DeletedAt,
              attempts,
              audit: true,
            },
            "Account deletion has used up its retry budget and needs manual recovery",
          );
        }
      }
    }

    const tombstones = await this.purgeExpiredTombstones();
    result.tombstonesPurged = tombstones.purged;

    this.logger.info(
      {
        event: "user.account.deletion_reconcile.completed",
        ...result,
        sanctionedTombstonesKept: tombstones.sanctionedKept,
        stuckAfterHours,
        audit: true,
      },
      "Account deletion reconcile finished",
    );

    return result;
  }

  /**
   * Deletes tombstones past their retention (docs/account-deletion.md §6a). A
   * tombstone is personal data (a hash of a stable social identifier and the
   * former user id), so it has a maximum like everything else. One that
   * carries nothing goes after TOMBSTONE_RETENTION_DAYS; one that carries a
   * suspension or a ban is judged against the reports about the account
   * (tombstoneExpiresAt). Its carried bans go with it by cascade.
   */
  async purgeExpiredTombstones(now: Date = new Date()): Promise<TombstonePurgeResult> {
    const batchSize = this.configService.getOrThrow<number>("users.accountDeletionReconcilerBatchSize");
    const reportRetentionDays = this.configService.getOrThrow<number>("moderation.reportRetentionDays");
    const baseCutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * DAY_MS);

    const plain = await this.prisma.deletedProviderSub.deleteMany({
      where: { deletedAt: { lt: baseCutoff }, suspendedAt: null, bans: { none: {} } },
    });
    const result: TombstonePurgeResult = { purged: plain.count, sanctionedKept: 0 };

    // Few tombstones carry a sanction, and those are kept for a long time, so
    // every one is looked at on each run: a batch that stopped at the oldest
    // would never reach the rest while those are still held.
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.deletedProviderSub.findMany({
        where: {
          deletedAt: { lt: baseCutoff },
          OR: [{ suspendedAt: { not: null } }, { bans: { some: {} } }],
          ...(cursor && { providerSubHash: { gt: cursor } }),
        },
        orderBy: { providerSubHash: "asc" },
        take: batchSize,
        select: { providerSubHash: true, formerUserId: true, deletedAt: true },
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1].providerSubHash;

      const reportsBySubject = await this.reportsAbout(page.map((tombstone) => tombstone.formerUserId));
      const expired = page.filter((tombstone) => {
        const expiresAt = tombstoneExpiresAt({
          deletedAt: tombstone.deletedAt,
          sanctioned: true,
          relatedReports: reportsBySubject.get(tombstone.formerUserId) ?? [],
          reportRetentionDays,
        });
        return expiresAt !== null && expiresAt <= now;
      });
      result.sanctionedKept += page.length - expired.length;

      if (expired.length > 0) {
        // Matched on deletedAt too: deleting the same identity again refreshes
        // it, and that newer tombstone has not been judged.
        const { count } = await this.prisma.deletedProviderSub.deleteMany({
          where: {
            OR: expired.map(({ providerSubHash, deletedAt }) => ({ providerSubHash, deletedAt })),
          },
        });
        result.purged += count;
      }
      if (page.length < batchSize) break;
    }

    if (result.purged > 0) {
      this.logger.info(
        { event: "user.tombstone.purged", ...result, audit: true },
        "Account deletion tombstones past their retention purged",
      );
    }
    return result;
  }

  // Reports about a deleted account are found by their evidence, which keeps
  // the subject's id after Report.reportedUserId is nulled.
  private async reportsAbout(formerUserIds: string[]): Promise<Map<string, TombstoneRelatedReport[]>> {
    const reports = await this.prisma.report.findMany({
      where: { evidence: { subjectUserId: { in: formerUserIds } } },
      select: { resolvedAt: true, holdUntil: true, evidence: { select: { subjectUserId: true } } },
    });
    const bySubject = new Map<string, TombstoneRelatedReport[]>();
    for (const { evidence, resolvedAt, holdUntil } of reports) {
      const subject = evidence?.subjectUserId;
      if (!subject) continue;
      bySubject.set(subject, [...(bySubject.get(subject) ?? []), { resolvedAt, holdUntil }]);
    }
    return bySubject;
  }
}
