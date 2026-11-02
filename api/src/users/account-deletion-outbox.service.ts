import { Injectable } from "@nestjs/common";
import { AccountDeletionOutboxAction, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ACCOUNT_DELETION_OUTBOX_BATCH_SIZE, ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS } from "./users.constants";

export interface OutboxDrainResult {
  /** Entries whose work is done (or kept for evidence, which the evidence job owns now). */
  done: number;
  /** Entries whose work failed and stays queued for the next drain. */
  failed: number;
  /** Entries dropped after ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS: the S3 orphan reconciler is their backstop. */
  givenUp: number;
}

/** Which entries one drain takes: one account's, or everything left behind before a time. */
export type OutboxScope = { userId: string } | { createdBefore: Date };

/**
 * The S3 side of account deletion, through an outbox (docs/account-deletion.md
 * §4). Prep writes the keys it collects in its own transaction (`enqueue`), so
 * they are durable the moment the rows they belonged to are gone; this drains
 * them after the commit. A pass that fails later, at Apple or Auth0, has
 * already lost nothing: its own drain ran, and a resumed saga or the
 * reconciler drains whatever is left.
 *
 * Every action is safe to repeat, so two drains that overlap (a request and
 * the reconciler) do the same work twice at worst, never the wrong work.
 * Never throws: S3 failures stay queued, a database failure is logged and
 * left for the next drain.
 */
@Injectable()
export class AccountDeletionOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoPurge: PhotoPurgeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** In the caller's transaction: the objects to purge once it commits. */
  async enqueuePurge(tx: Prisma.TransactionClient, userId: string, s3Keys: string[]): Promise<void> {
    if (s3Keys.length === 0) return;
    await tx.accountDeletionOutbox.createMany({
      data: [...new Set(s3Keys)].map((s3Key) => ({ userId, action: AccountDeletionOutboxAction.PURGE, s3Key })),
      skipDuplicates: true,
    });
  }

  async drain(scope: OutboxScope): Promise<OutboxDrainResult> {
    const result: OutboxDrainResult = { done: 0, failed: 0, givenUp: 0 };
    try {
      await this.drainPurges(scope, result);
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "user.account.deletion_outbox.drain_failed", ...scope },
        "Draining the account deletion outbox failed; the next drain retries",
      );
    }
    return result;
  }

  private async drainPurges(scope: OutboxScope, result: OutboxDrainResult): Promise<void> {
    const where: Prisma.AccountDeletionOutboxWhereInput = {
      action: AccountDeletionOutboxAction.PURGE,
      ...("userId" in scope ? { userId: scope.userId } : { createdAt: { lt: scope.createdBefore } }),
    };
    // Keyset pages over the ids, so entries that stay queued after a failure
    // are not read again in the same drain.
    let cursor: string | undefined;
    for (;;) {
      const entries = await this.prisma.accountDeletionOutbox.findMany({
        where: cursor ? { ...where, id: { gt: cursor } } : where,
        orderBy: { id: "asc" },
        take: ACCOUNT_DELETION_OUTBOX_BATCH_SIZE,
        select: { id: true, userId: true, s3Key: true, attempts: true },
      });
      if (entries.length === 0) return;
      cursor = entries[entries.length - 1].id;

      const purge = await this.photoPurge.purgeObjects(
        entries.map((entry) => entry.s3Key),
        { event: ALERT_EVENTS.ACCOUNT_PHOTOS_PURGED, ...("userId" in scope ? { userId: scope.userId } : {}) },
      );
      const failedKeys = new Set(purge.failedKeys);
      const failed = entries.filter((entry) => failedKeys.has(entry.s3Key));
      const settled = entries.filter((entry) => !failedKeys.has(entry.s3Key));
      const exhausted = failed.filter((entry) => entry.attempts + 1 >= ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS);
      const retried = failed.filter((entry) => entry.attempts + 1 < ACCOUNT_DELETION_OUTBOX_MAX_ATTEMPTS);

      const finished = [...settled, ...exhausted].map((entry) => entry.id);
      if (finished.length > 0) await this.prisma.accountDeletionOutbox.deleteMany({ where: { id: { in: finished } } });
      if (retried.length > 0) {
        await this.prisma.accountDeletionOutbox.updateMany({
          where: { id: { in: retried.map((entry) => entry.id) } },
          data: { attempts: { increment: 1 } },
        });
      }
      if (exhausted.length > 0) {
        this.logger.error(
          {
            event: ALERT_EVENTS.ACCOUNT_DELETION_OUTBOX_GIVEN_UP,
            entries: exhausted.length,
            userIds: [...new Set(exhausted.map((entry) => entry.userId))],
            audit: true,
          },
          "Account deletion objects that kept failing were left to the S3 orphan reconciler",
        );
      }

      result.done += settled.length;
      result.failed += retried.length;
      result.givenUp += exhausted.length;
      if (entries.length < ACCOUNT_DELETION_OUTBOX_BATCH_SIZE) return;
    }
  }
}
