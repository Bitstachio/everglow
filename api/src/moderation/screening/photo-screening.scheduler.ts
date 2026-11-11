import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { PhotoScreeningService } from "./photo-screening.service";
import { UploadScreeningService } from "./upload-screening.service";

/** Every minute, screens the photos upload confirm had to hold (docs/moderation.md §11). */
@Injectable()
export class PhotoScreeningScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly photoScreeningService: PhotoScreeningService,
    private readonly uploadScreeningService: UploadScreeningService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Say so at boot when screening is off: new photos are published without a check. */
  onApplicationBootstrap(): void {
    if (this.uploadScreeningService.isEnabled()) return;

    this.logger.warn(
      { event: ALERT_EVENTS.PHOTO_SCREENING_DISABLED },
      "Upload screening is disabled: new photos are published without a check for objectionable content. " +
        "Set MODERATION_SCREENING_ENABLED=true once the steps in infra/README.md are done.",
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRun(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Upload screening",
      enabled: this.uploadScreeningService.isEnabled(),
      completedEvent: ALERT_EVENTS.PHOTO_SCREENING_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.PHOTO_SCREENING_RUN_FAILED,
      run: () => this.photoScreeningService.screenHeld(),
    });
  }
}
