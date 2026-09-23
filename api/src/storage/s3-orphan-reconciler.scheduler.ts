import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
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
    await runScheduledJob(this.logger, {
      name: "Orphaned S3 object reconcile",
      enabled: this.configService.get<boolean>("storage.orphanReconcilerEnabled"),
      completedEvent: ALERT_EVENTS.S3_ORPHAN_RECONCILE_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.S3_ORPHAN_RECONCILE_RUN_FAILED,
      run: () => this.reconcilerService.reconcileOrphanedObjects(),
    });
  }
}
