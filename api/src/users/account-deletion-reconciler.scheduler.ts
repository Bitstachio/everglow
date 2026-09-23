import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
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
    if (this.isEnabled()) return;

    this.logger.warn(
      { event: ALERT_EVENTS.ACCOUNT_DELETION_RECONCILER_DISABLED },
      "Account deletion reconciler is disabled: a deletion that fails part way will not be finished automatically. " +
        "Set ACCOUNT_DELETION_RECONCILER_ENABLED=true wherever this database owns the Auth0 tenant.",
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReconcile(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Account deletion reconcile",
      enabled: this.isEnabled(),
      completedEvent: ALERT_EVENTS.ACCOUNT_DELETION_RECONCILE_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.ACCOUNT_DELETION_RECONCILE_RUN_FAILED,
      run: () => this.reconcilerService.reconcilePendingDeletions(),
    });
  }

  private isEnabled(): boolean | undefined {
    return this.configService.get<boolean>("users.accountDeletionReconcilerEnabled");
  }
}
