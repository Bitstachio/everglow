import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";

@Injectable()
export class PhotoOrphanReconcilerScheduler {
  constructor(
    private readonly reconcilerService: PhotoOrphanReconcilerService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  // Daily, off-peak: every run lists the whole photos/ prefix, which is not
  // worth doing hourly, and orphans cost money rather than correctness.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleReconcile(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Orphaned photo object reconcile",
      enabled: this.configService.get<boolean>("photos.orphanReconcilerEnabled"),
      completedEvent: ALERT_EVENTS.PHOTO_ORPHAN_RECONCILE_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.PHOTO_ORPHAN_RECONCILE_RUN_FAILED,
      run: () => this.reconcilerService.reconcileOrphanedObjects(),
    });
  }
}
