import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { GalleryCloseService } from "./gallery-close.service";

@Injectable()
export class GalleryCloseScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly galleryCloseService: GalleryCloseService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Say so at boot when the job is off. Closed galleries already show no
   * photos, but without the job their photos are never removed: the storage
   * stays billed and the "removed after 30 days" promise is not kept.
   */
  onApplicationBootstrap(): void {
    if (this.isEnabled()) return;

    this.logger.warn(
      { event: ALERT_EVENTS.GALLERY_CLOSE_DISABLED },
      "Gallery close is disabled: galleries past their window keep their photos. " +
        "Set GALLERY_CLOSE_ENABLED=true wherever this database owns AWS_S3_BUCKET.",
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleClose(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Gallery close",
      enabled: this.isEnabled(),
      completedEvent: ALERT_EVENTS.GALLERY_CLOSE_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.GALLERY_CLOSE_RUN_FAILED,
      run: () => this.galleryCloseService.closeDueGalleries(),
    });
  }

  private isEnabled(): boolean | undefined {
    return this.configService.get<boolean>("photos.galleryCloseEnabled");
  }
}
