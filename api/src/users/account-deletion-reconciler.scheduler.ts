import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";

@Injectable()
export class AccountDeletionReconcilerScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly reconcilerService: AccountDeletionReconcilerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Say so at boot when the job is off. A deletion that fails after its intent
   * is stamped locks the account out of every route, and this job is the only
   * thing that finishes it; without the job that state is permanent. Cheaper to
   * notice here than from a support ticket.
   */
  onApplicationBootstrap(): void {
    if (this.configService.get<boolean>("users.accountDeletionReconcilerEnabled")) return;

    this.logger.warn(
      { event: "user.account.deletion_reconciler.disabled" },
      "Account deletion reconciler is disabled: a deletion that fails part way will not be finished automatically. " +
        "Set ACCOUNT_DELETION_RECONCILER_ENABLED=true wherever this database owns the Auth0 tenant.",
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReconcile(): Promise<void> {
    if (!this.configService.get<boolean>("users.accountDeletionReconcilerEnabled")) return;

    try {
      await this.reconcilerService.reconcilePendingDeletions();
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "user.account.deletion_reconcile.run_failed" },
        "Account deletion reconcile run failed",
      );
    }
  }
}
