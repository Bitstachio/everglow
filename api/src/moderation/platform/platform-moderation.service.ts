import { Injectable, NotFoundException } from "@nestjs/common";
import { ReportHoldReason, ReportQueue, ReportReason, ReportStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { DEFAULT_PAGE_SIZE } from "src/common/pagination/pagination.constants";
import {
  KEYSET_ORDER_BY_OLDEST,
  KeysetPage,
  keysetAfterOldest,
  toKeysetPage,
} from "src/common/pagination/keyset-cursor";
import { PrismaService } from "src/prisma/prisma.service";
import { presignedUrlExpiresAt, S3Service } from "src/sdk/aws/s3/s3.service";
import { CHILD_SAFETY_HOLD_DAYS } from "../moderation.constants";
import { ListPlatformReportsQueryDto } from "./dto/list-platform-reports-query.dto";
import { ReportWithEvidence } from "./platform-report.mapper";

/** How long a moderator's link to reported content works (docs/moderation.md §8). */
export const EVIDENCE_URL_TTL_SECONDS = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What platform moderators do besides giving verdicts, which ReportsService
 * owns so that both queues close reports the same way (docs/moderation.md §8).
 * Every action is audit-logged with the moderator's id.
 */
@Injectable()
export class PlatformModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** A queue across events, oldest first: the platform's OPEN reports unless asked otherwise. */
  async listReports(query: ListPlatformReportsQueryDto): Promise<KeysetPage<ReportWithEvidence>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const reports = await this.prisma.report.findMany({
      where: {
        AND: [
          {
            queue: query.queue ?? ReportQueue.PLATFORM,
            status: query.status ?? ReportStatus.OPEN,
            ...(query.eventId && { eventId: query.eventId }),
          },
          ...keysetAfterOldest(query.cursor),
        ],
      },
      include: { evidence: true },
      orderBy: KEYSET_ORDER_BY_OLDEST,
      take: limit + 1,
    });

    return toKeysetPage(reports, limit);
  }

  async getReport(reportId: string): Promise<ReportWithEvidence> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId }, include: { evidence: true } });
    if (!report) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Report", "ID", reportId));
    return report;
  }

  /**
   * A short-lived link to what the report is about: its evidence copy once
   * there is one, the live object before that. Every link is logged, so each
   * look at reported content leaves a trace (docs/photo-privacy.md).
   */
  async evidenceUrl(reportId: string, moderatorId: string): Promise<{ url: string; expiresAt: Date }> {
    const report = await this.getReport(reportId);
    const key = report.evidence?.evidenceS3Key ?? report.evidence?.objectS3Key;
    if (!key) throw new ApiException("EVIDENCE_NOT_AVAILABLE", { reportId });

    const expiresAt = presignedUrlExpiresAt(EVIDENCE_URL_TTL_SECONDS);
    const url = await this.s3Service.getPresignedDownloadUrl({ key, expiresInSeconds: EVIDENCE_URL_TTL_SECONDS });
    this.logger.warn(
      {
        event: "report.evidence.viewed",
        reportId,
        moderatorId,
        quarantined: report.evidence?.evidenceS3Key != null,
        reason: report.reason,
        audit: true,
      },
      "A moderator opened reported content",
    );
    return { url, expiresAt };
  }

  /** Keeps a report and its evidence past the retention window, until `until`. */
  async setHold(
    reportId: string,
    moderatorId: string,
    until: Date,
    reason: ReportHoldReason,
  ): Promise<ReportWithEvidence> {
    await this.getReport(reportId);
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { holdUntil: until, holdReason: reason },
      include: { evidence: true },
    });
    this.logger.info(
      { event: "report.hold.set", reportId, moderatorId, holdUntil: until, holdReason: reason, audit: true },
      "Report held",
    );
    return report;
  }

  async releaseHold(reportId: string, moderatorId: string): Promise<ReportWithEvidence> {
    await this.getReport(reportId);
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { holdUntil: null, holdReason: null },
      include: { evidence: true },
    });
    this.logger.info({ event: "report.hold.released", reportId, moderatorId, audit: true }, "Report hold released");
    return report;
  }

  /**
   * Records that the report went to NCMEC's CyberTipline or the police, and
   * holds it for a year from the submission: the preservation the law asks
   * for (18 U.S.C. §2258A(h); docs/moderation.md §7). A longer hold stays.
   */
  async recordAuthorityReport(
    reportId: string,
    moderatorId: string,
    reference: string,
    submittedAt: Date = new Date(),
  ): Promise<ReportWithEvidence> {
    const current = await this.getReport(reportId);
    const preservedUntil = new Date(submittedAt.getTime() + CHILD_SAFETY_HOLD_DAYS * DAY_MS);
    const holdUntil = current.holdUntil && current.holdUntil > preservedUntil ? current.holdUntil : preservedUntil;
    const holdReason =
      current.reason === ReportReason.CHILD_SAFETY ? ReportHoldReason.CHILD_SAFETY : ReportHoldReason.LAW_ENFORCEMENT;

    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { authorityReference: reference, holdUntil, holdReason },
      include: { evidence: true },
    });
    // The reference itself is not logged: it identifies a case outside Everglow.
    this.logger.info(
      { event: "report.authority_report.recorded", reportId, moderatorId, holdUntil, holdReason, audit: true },
      "Report recorded as reported to the authorities",
    );
    return report;
  }

  /** Ends an event's review: joins and uploads work again, and the close job may remove its photos. */
  async liftReview(eventId: string, moderatorId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { underReviewAt: true } });
    if (!event) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId));
    if (!event.underReviewAt) return;

    await this.prisma.event.update({ where: { id: eventId }, data: { underReviewAt: null } });
    this.logger.info(
      { event: "event.review.lifted", eventId, moderatorId, underReviewAt: event.underReviewAt, audit: true },
      "Event review lifted",
    );
  }
}
