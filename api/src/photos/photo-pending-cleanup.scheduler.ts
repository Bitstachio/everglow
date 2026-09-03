import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
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
    if (!this.configService.get<boolean>("photos.pendingCleanupEnabled")) return;

    try {
      await this.cleanupService.cleanupStalePendingPhotos();
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "photo.pending_cleanup.run_failed" },
        "Pending photo cleanup run failed",
      );
    }
  }
}
