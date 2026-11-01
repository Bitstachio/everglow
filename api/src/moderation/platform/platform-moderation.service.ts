import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ReportHoldReason, ReportQueue, ReportReason, ReportStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { Readable } from "node:stream";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { ALERT_EVENTS, ALERT_SEVERITY } from "src/common/logging/alert-events.constants";
import { DEFAULT_PAGE_SIZE } from "src/common/pagination/pagination.constants";
import {
  KEYSET_ORDER_BY_OLDEST,
  KeysetPage,
  keysetAfterOldest,
  toKeysetPage,
} from "src/common/pagination/keyset-cursor";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "../evidence/evidence.service";
import { CHILD_SAFETY_HOLD_DAYS } from "../moderation.constants";
import { ListPlatformReportsQueryDto } from "./dto/list-platform-reports-query.dto";
import { ReportWithEvidence } from "./platform-report.mapper";

/** The furthest ahead a moderator may set a hold (docs/moderation.md §7). */
export const MAX_HOLD_YEARS = 3;

/** Reported content on its way to a moderator (openEvidence). */
export interface EvidenceStream {
  body: Readable;
  contentType: string;
  contentLength: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// How far ahead of the API's clock a submission time may be, for a moderator
// whose own clock runs a little fast.
const SUBMITTED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** The day a report sent to the authorities may be purged at the earliest: a year after the submission. */
export const authorityPreservedUntil = (authorityReportedAt: Date): Date =>
  new Date(authorityReportedAt.getTime() + CHILD_SAFETY_HOLD_DAYS * DAY_MS);

/** max() of two optional dates: a hold only ever grows by this rule. */
const laterOf = (current: Date | null, floor: Date): Date => (current && current > floor ? current : floor);

/** Whether the retention purge would skip the report now. */
const isHeld = (report: { holdUntil: Date | null }, now: Date): boolean =>
  report.holdUntil !== null && report.holdUntil > now;

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
    private readonly evidenceService: EvidenceService,
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
   * Opens what the report is about for a moderator to look at: its evidence
   * copy once there is one, the live object before that. The bytes go through
   * the API instead of a URL that could be forwarded, so each look is one
   * request by one moderator, logged as `report.evidence.viewed`, which pages
   * for a child-safety report (docs/photo-privacy.md, docs/moderation.md §8).
   * A closed report's evidence opens only while it is held: once decided,
   * there is nothing left to judge.
   */
  async openEvidence(reportId: string, moderatorId: string, now: Date = new Date()): Promise<EvidenceStream> {
    const report = await this.getReport(reportId);
    if (report.status !== ReportStatus.OPEN && !isHeld(report, now)) {
      throw new ApiException("EVIDENCE_REPORT_CLOSED", { reportId });
    }
    const key = report.evidence?.evidenceS3Key ?? report.evidence?.objectS3Key;
    if (!key) throw new ApiException("EVIDENCE_NOT_AVAILABLE", { reportId });

    const object = await this.s3Service.getObjectStream(key);
    if (!object) throw new ApiException("EVIDENCE_NOT_AVAILABLE", { reportId });

    this.logger.warn(
      {
        event: ALERT_EVENTS.REPORT_EVIDENCE_VIEWED,
        reportId,
        eventId: report.eventId,
        moderatorId,
        reason: report.reason,
        status: report.status,
        quarantined: report.evidence?.evidenceS3Key != null,
        severity: report.reason === ReportReason.CHILD_SAFETY ? ALERT_SEVERITY.PAGE : ALERT_SEVERITY.TICKET,
        audit: true,
      },
      "A moderator opened reported content",
    );
    return {
      body: object.body,
      contentType: object.contentType ?? report.evidence?.contentType ?? "application/octet-stream",
      contentLength: object.contentLength ?? null,
    };
  }

  /**
   * Keeps a report and its evidence past the retention window, until `until`:
   * a time in the future, at most MAX_HOLD_YEARS away. A report sent to the
   * authorities is never held for less than a year from the submission.
   */
  async setHold(
    reportId: string,
    moderatorId: string,
    until: Date,
    reason: ReportHoldReason,
    now: Date = new Date(),
  ): Promise<ReportWithEvidence> {
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() + MAX_HOLD_YEARS);
    if (until <= now || until > latest) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE(
          "until",
          until.toISOString(),
          `in the future, at most ${MAX_HOLD_YEARS} years away`,
        ),
      );
    }
    const current = await this.getReport(reportId);
    const holdUntil = current.authorityReportedAt
      ? laterOf(until, authorityPreservedUntil(current.authorityReportedAt))
      : until;

    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { holdUntil, holdReason: reason },
      include: { evidence: true },
    });
    this.logger.info(
      { event: "report.hold.set", reportId, moderatorId, holdUntil, holdReason: reason, audit: true },
      "Report held",
    );
    return report;
  }

  /**
   * Ends a hold. A report sent to the authorities stays held until a year
   * after the submission, which no release shortens. An actioned
   * intimate-image report loses its evidence copy at once, as it would have
   * at the verdict without the hold (docs/moderation.md §7).
   */
  async releaseHold(reportId: string, moderatorId: string, now: Date = new Date()): Promise<ReportWithEvidence> {
    const current = await this.getReport(reportId);
    const preservedUntil = current.authorityReportedAt ? authorityPreservedUntil(current.authorityReportedAt) : null;
    const kept = preservedUntil && preservedUntil > now ? preservedUntil : null;

    await this.prisma.report.update({
      where: { id: reportId },
      data: kept ? { holdUntil: kept } : { holdUntil: null, holdReason: null },
    });
    this.logger.info(
      { event: "report.hold.released", reportId, moderatorId, keptUntil: kept, audit: true },
      kept ? "Report hold released down to the authorities' preservation date" : "Report hold released",
    );
    if (!kept) await this.evidenceService.discardImages([reportId], now);

    return this.getReport(reportId);
  }

  /**
   * Records that the report went to NCMEC's CyberTipline or the police, and
   * when (`authorityReportedAt`). The hold becomes the later of the current
   * one and a year from the submission: the preservation the law asks for
   * (18 U.S.C. §2258A(h); docs/moderation.md §7). A longer hold stays.
   */
  async recordAuthorityReport(
    reportId: string,
    moderatorId: string,
    reference: string,
    submittedAt: Date = new Date(),
  ): Promise<ReportWithEvidence> {
    if (submittedAt.getTime() > Date.now() + SUBMITTED_AT_CLOCK_SKEW_MS) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE("submittedAt", submittedAt.toISOString(), "in the past"),
      );
    }
    const current = await this.getReport(reportId);
    const holdUntil = laterOf(current.holdUntil, authorityPreservedUntil(submittedAt));
    const holdReason =
      current.reason === ReportReason.CHILD_SAFETY ? ReportHoldReason.CHILD_SAFETY : ReportHoldReason.LAW_ENFORCEMENT;

    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: { authorityReference: reference, authorityReportedAt: submittedAt, holdUntil, holdReason },
      include: { evidence: true },
    });
    // The reference itself is not logged: it identifies a case outside Everglow.
    this.logger.info(
      {
        event: "report.authority_report.recorded",
        reportId,
        moderatorId,
        authorityReportedAt: submittedAt,
        holdUntil,
        holdReason,
        audit: true,
      },
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
