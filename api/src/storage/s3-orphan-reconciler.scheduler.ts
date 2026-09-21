import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { S3OrphanReconcilerService } from "./s3-orphan-reconciler.service";

@Injectable()
export class S3OrphanReconcilerScheduler {
  constructor(
    private readonly reconcilerService: S3OrphanReconcilerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  // Daily, off-peak: every run lists every registered prefix end to end, which is not
  // worth doing hourly, and orphans cost money rather than correctness.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleReconcile(): Promise<void> {
    if (!this.configService.get<boolean>("storage.orphanReconcilerEnabled")) return;

    try {
      await this.reconcilerService.reconcileOrphanedObjects();
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "storage.orphan_reconcile.run_failed" },
        "Orphaned S3 object reconcile run failed",
      );
    }
  }
}
