import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { AccountDeletionReconcilerService } from "./account-deletion-reconciler.service";

@Injectable()
export class AccountDeletionReconcilerScheduler {
  constructor(
    private readonly reconcilerService: AccountDeletionReconcilerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
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
