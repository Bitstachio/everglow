import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { UsersService } from "./users.service";

export interface AccountDeletionReconcileResult {
  // Users with deletionStartedAt set that this run attempted
  scanned: number;
  // Users whose saga completed (Postgres row gone)
  deleted: number;
  // Users whose saga threw; retried on a later run
  failed: number;
  // Users whose deletionStartedAt is older than the stuck threshold (also counted in failed/deleted)
  stuck: number;
}

const HOUR_MS = 60 * 60 * 1000;

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
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async reconcilePendingDeletions(): Promise<AccountDeletionReconcileResult> {
    const batchSize = this.configService.getOrThrow<number>("users.accountDeletionReconcilerBatchSize");
    const stuckAfterHours = this.configService.getOrThrow<number>("users.accountDeletionReconcilerStuckAfterHours");
    const stuckCutoff = new Date(Date.now() - stuckAfterHours * HOUR_MS);

    const pending = await this.prisma.user.findMany({
      where: { deletionStartedAt: { not: null } },
      orderBy: { deletionStartedAt: "asc" },
      take: batchSize,
      select: {
        id: true,
        providerSub: true,
        deletionStartedAt: true,
        auth0DeletedAt: true,
      },
    });

    const result: AccountDeletionReconcileResult = {
      scanned: pending.length,
      deleted: 0,
      failed: 0,
      stuck: 0,
    };

    for (const user of pending) {
      const isStuck = user.deletionStartedAt !== null && user.deletionStartedAt <= stuckCutoff;
      if (isStuck) {
        result.stuck += 1;
        this.logger.warn(
          {
            event: "user.account.deletion_stuck",
            userId: user.id,
            deletionStartedAt: user.deletionStartedAt,
            auth0DeletedAt: user.auth0DeletedAt,
            stuckAfterHours,
            audit: true,
          },
          "Account deletion saga still pending past stuck threshold",
        );
      }

      try {
        await this.usersService.completeAccountDeletion(user);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          {
            err: error as Error,
            event: "user.account.deletion_reconcile.failed",
            userId: user.id,
            deletionStartedAt: user.deletionStartedAt,
            auth0DeletedAt: user.auth0DeletedAt,
            audit: true,
          },
          "Failed to finish pending account deletion",
        );
      }
    }

    this.logger.info(
      { event: "user.account.deletion_reconcile.completed", ...result, stuckAfterHours, audit: true },
      "Account deletion reconcile finished",
    );

    return result;
  }
}
