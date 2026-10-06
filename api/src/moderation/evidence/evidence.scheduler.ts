import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { runScheduledJob } from "src/common/scheduling/run-scheduled-job";
import { EvidenceService } from "./evidence.service";

@Injectable()
export class EvidenceScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Say so at boot when the job is off: failed evidence copies are never
   * retried, and reports are kept past the retention window the privacy
   * policy promises.
   */
  onApplicationBootstrap(): void {
    if (this.isEnabled()) return;

    this.logger.warn(
      { event: ALERT_EVENTS.REPORT_EVIDENCE_JOB_DISABLED },
      "The evidence job is disabled: failed evidence copies aren't retried and reports aren't purged " +
        "after the retention window. Set MODERATION_EVIDENCE_JOB_ENABLED=true wherever this database owns " +
        "AWS_S3_BUCKET.",
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleRun(): Promise<void> {
    await runScheduledJob(this.logger, {
      name: "Evidence job",
      enabled: this.isEnabled(),
      completedEvent: ALERT_EVENTS.REPORT_EVIDENCE_RUN_COMPLETED,
      failedEvent: ALERT_EVENTS.REPORT_EVIDENCE_RUN_FAILED,
      run: () => this.evidenceService.runEvidenceJob(),
    });
  }

  private isEnabled(): boolean | undefined {
    return this.configService.get<boolean>("moderation.evidenceJobEnabled");
  }
}
