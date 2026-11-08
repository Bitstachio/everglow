import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { GalleryClosingReminderService } from "./gallery-closing-reminder.service";

@Injectable()
export class GalleryClosingReminderScheduler {
  constructor(
    private readonly reminders: GalleryClosingReminderService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleReminders(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Gallery closing reminder",
      enabled: true,
      completedEvent: ALERT_EVENTS.GALLERY_CLOSING_REMINDER_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.GALLERY_CLOSING_REMINDER_RUN_FAILED,
      run: () => this.reminders.remindClosingGalleries(),
    });
  }
}
