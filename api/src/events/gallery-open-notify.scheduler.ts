import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { GalleryOpenNotifyService } from "./gallery-open-notify.service";

@Injectable()
export class GalleryOpenNotifyScheduler {
  constructor(
    private readonly galleryOpenNotify: GalleryOpenNotifyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleOpened(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Gallery open notify",
      enabled: true,
      completedEvent: ALERT_EVENTS.GALLERY_OPEN_NOTIFY_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.GALLERY_OPEN_NOTIFY_RUN_FAILED,
      run: () => this.galleryOpenNotify.notifyOpenedGalleries(),
    });
  }
}
