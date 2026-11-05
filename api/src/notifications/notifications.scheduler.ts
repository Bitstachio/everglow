import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { NotificationSenderService } from "./notification-sender.service";

/**
 * The sender's backstop and its upkeep (docs/notifications.md §4). Most
 * notifications go out from the kick right after their transaction commits;
 * the minute tick sends what a kick missed and retries what failed.
 */
@Injectable()
export class NotificationsScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly sender: NotificationSenderService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  onApplicationBootstrap(): void {
    if (this.sender.isEnabled()) return;
    this.logger.warn(
      { event: ALERT_EVENTS.NOTIFICATION_SENDER_DISABLED },
      "The notification sender is disabled: notifications queue up and nothing is sent. " +
        "Unset NOTIFICATIONS_SENDER_ENABLED or set it to true.",
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleSend(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Notification send",
      enabled: this.sender.isEnabled(),
      completedEvent: ALERT_EVENTS.NOTIFICATION_SEND_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.NOTIFICATION_SEND_RUN_FAILED,
      run: () => this.sender.sendPending(),
    });
  }

  @Cron("*/15 * * * *")
  async handleReceipts(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Notification receipts",
      enabled: this.sender.isEnabled(),
      completedEvent: ALERT_EVENTS.NOTIFICATION_RECEIPTS_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.NOTIFICATION_RECEIPTS_RUN_FAILED,
      run: () => this.sender.checkReceipts(),
    });
  }

  // Deleting history is not sending, so it runs even with the sender off.
  @Cron("0 5 * * *")
  async handleRetention(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Notification retention",
      enabled: true,
      completedEvent: ALERT_EVENTS.NOTIFICATION_RETENTION_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.NOTIFICATION_RETENTION_RUN_FAILED,
      run: () => this.sender.purgeExpired(),
    });
  }
}
