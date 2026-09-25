import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { ReportsService } from "./reports.service";

/**
 * Hourly backstop for reports nobody acts on (docs/moderation.md, "Escalation").
 * Read-only, so it is always on: it logs, and changes nothing.
 */
@Injectable()
export class StaleReportCheckScheduler {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCheck(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Stale report check",
      enabled: true,
      completedEvent: ALERT_EVENTS.STALE_REPORT_CHECK_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.STALE_REPORT_CHECK_RUN_FAILED,
      run: () => this.reportsService.reportStaleReports(),
    });
  }
}
