import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";

@Injectable()
export class PhotoPendingCleanupScheduler {
  constructor(
    private readonly cleanupService: PhotoPendingCleanupService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Pending photo cleanup",
      enabled: this.configService.get<boolean>("photos.pendingCleanupEnabled"),
      completedEvent: ALERT_EVENTS.PHOTO_PENDING_CLEANUP_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.PHOTO_PENDING_CLEANUP_RUN_FAILED,
      run: () => this.cleanupService.cleanupStalePendingPhotos(),
    });
  }
}
