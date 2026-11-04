import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { PhotoHashBackfillService } from "./photo-hash-backfill.service";

@Injectable()
export class PhotoHashBackfillScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly photoHashBackfillService: PhotoHashBackfillService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Say so at boot when the job is off: photos confirmed before hashes were
   * recorded, or whose read failed at confirm, are never matched against a
   * removed intimate image.
   */
  onApplicationBootstrap(): void {
    if (this.isEnabled()) return;

    this.logger.warn(
      { event: ALERT_EVENTS.PHOTO_HASH_BACKFILL_DISABLED },
      "The photo hash backfill is disabled: photos without a hash aren't checked for identical copies of a " +
        "removed intimate image. Set PHOTO_HASH_BACKFILL_ENABLED=true wherever this database owns AWS_S3_BUCKET.",
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleRun(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Photo hash backfill",
      enabled: this.isEnabled(),
      completedEvent: ALERT_EVENTS.PHOTO_HASH_BACKFILL_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.PHOTO_HASH_BACKFILL_RUN_FAILED,
      run: () => this.photoHashBackfillService.runBackfill(),
    });
  }

  private isEnabled(): boolean | undefined {
    return this.configService.get<boolean>("photos.hashBackfillEnabled");
  }
}
