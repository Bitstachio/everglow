import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AccessLevel,
  Event,
  EventAccess,
  PhotoStatus,
  Prisma,
  Report,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { DEFAULT_PAGE_SIZE } from "src/common/pagination/pagination.constants";
import { KEYSET_ORDER_BY, KeysetPage, keysetAfter, toKeysetPage } from "src/common/pagination/keyset-cursor";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { eventWithCallerAccessInclude } from "src/events/events.types";
import { PHOTO_SERVICE_ERRORS } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { ListReportsQueryDto } from "./dto/list-reports-query.dto";
import {
  REPORT_ESCALATION_REASONS,
  REPORT_SERVICE_ERRORS,
  ReportEscalationReason,
  ReportResolution,
  SEVERE_REPORT_REASONS,
  reportHideThreshold,
} from "./moderation.constants";
import { eventForPhotoVisibilityInclude } from "./moderation.types";
import { PhotoVisibilityService } from "./photo-visibility.service";
import { REPORT_ACTIONS, REPORT_SUBJECT } from "./reports.abilities";

/** What a report points at; `photoId` is set for PHOTO reports only. */
type ReportTarget = Pick<Report, "eventId" | "targetType" | "photoId" | "reportedUserId">;

/** Facts about the target that decide whether a new report is escalated. */
interface EscalationContext {
  /** The reported user's role in the event; null when they are not a member or no longer exist. */
  reportedAccessLevel: AccessLevel | null;
  /** The event's hide threshold, for PHOTO reports. */
  hideThreshold?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly photoVisibilityService: PhotoVisibilityService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async reportPhoto(photoId: string, callerId: string, dto: CreateReportDto): Promise<Report> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { include: eventForPhotoVisibilityInclude(callerId) } },
    });
    // Unverified photos are invisible, same as in the photo read paths.
    if (!photo || photo.status !== PhotoStatus.READY) {
      throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));
    }

    await this.assertCanReportIn(photo.event, callerId);
    if (photo.addedById === callerId) throw new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF);

    const target: ReportTarget = {
      eventId: photo.eventId,
      targetType: ReportTargetType.PHOTO,
      photoId,
      reportedUserId: photo.addedById,
    };

    // A photo the caller cannot see (blocked, or already hidden from everyone)
    // does not exist for them and must not be reportable by id either. The one
    // exception is a photo hidden by their own open report: that is a repeat,
    // and it gets the report back.
    if (!(await this.photoVisibilityService.isVisibleTo(photoId, callerId, photo.event))) {
      const existing = await this.findOpenReport(callerId, target);
      if (!existing) throw new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId));
      return existing;
    }

    const uploaderAccess = photo.addedById
      ? await this.prisma.eventAccess.findUnique({
          where: { userId_eventId: { userId: photo.addedById, eventId: photo.eventId } },
        })
      : null;

    return this.createReport(callerId, target, dto, {
      reportedAccessLevel: uploaderAccess?.accessLevel ?? null,
      hideThreshold: reportHideThreshold(photo.event._count.eventAccesses),
    });
  }

  async reportMember(eventId: string, targetUserId: string, callerId: string, dto: CreateReportDto): Promise<Report> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    await this.assertCanReportIn(event, callerId);
    if (targetUserId === callerId) throw new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF);

    const targetAccess = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: targetUserId, eventId } },
    });
    if (!targetAccess) throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId));

    const target: ReportTarget = {
      eventId,
      targetType: ReportTargetType.MEMBER,
      photoId: null,
      reportedUserId: targetUserId,
    };

    return this.createReport(callerId, target, dto, { reportedAccessLevel: targetAccess.accessLevel });
  }

  async listReports(eventId: string, callerId: string, query: ListReportsQueryDto): Promise<KeysetPage<Report>> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    // Listing is reading reports of the event; authorize against a prospective row.
    const prospectiveReport = subject(REPORT_SUBJECT, { eventId, event } as unknown as Report);
    if (!ability.can(REPORT_ACTIONS.READ, prospectiveReport)) {
      throw new ForbiddenException(REPORT_SERVICE_ERRORS.LIST_FORBIDDEN(eventId));
    }

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const reports = await this.prisma.report.findMany({
      where: {
        AND: [
          { eventId, ...(query.status && { status: query.status }) },
          accessibleBy(ability, REPORT_ACTIONS.READ).ofType(REPORT_SUBJECT) as Prisma.ReportWhereInput,
          ...keysetAfter(query.cursor),
        ],
      },
      orderBy: KEYSET_ORDER_BY,
      take: limit + 1,
    });

    return toKeysetPage(reports, limit);
  }

  async resolveReport(reportId: string, callerId: string, resolution: ReportResolution): Promise<Report> {
    const loaded = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { event: { include: eventWithCallerAccessInclude(callerId) } },
    });
    if (!loaded) throw new NotFoundException(REPORT_SERVICE_ERRORS.NOT_FOUND(reportId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(REPORT_ACTIONS.UPDATE, subject(REPORT_SUBJECT, loaded))) {
      throw new ForbiddenException(REPORT_SERVICE_ERRORS.RESOLVE_FORBIDDEN(reportId));
    }

    // An organizer must not be the judge of a report about themselves or their
    // own photo. With no other organizer it stays open: `report.escalated`
    // already told the platform owner about it.
    if (loaded.reportedUserId === callerId) throw new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_RESOLVE_OWN);

    // Guarded on OPEN so that, of two organizers resolving at once, one wins
    // and the other is told, instead of the later verdict silently replacing
    // the earlier one.
    const [resolved] = await this.prisma.report.updateManyAndReturn({
      where: { id: reportId, status: ReportStatus.OPEN },
      data: { status: resolution, resolvedById: callerId, resolvedAt: new Date() },
    });
    if (!resolved) throw new ConflictException(REPORT_SERVICE_ERRORS.ALREADY_RESOLVED(reportId));

    this.logger.info(
      {
        event: "report.resolved",
        reportId,
        eventId: resolved.eventId,
        callerId,
        targetType: resolved.targetType,
        photoId: resolved.photoId,
        reportedUserId: resolved.reportedUserId,
        resolution,
        audit: true,
      },
      "Report resolved",
    );

    return resolved;
  }

  private async assertCanReportIn(event: Event & { eventAccesses: EventAccess[] }, callerId: string): Promise<void> {
    const ability = await this.abilityFactory.createForCaller(callerId);
    // The report does not exist yet, so authorize against a prospective row.
    const prospectiveReport = subject(REPORT_SUBJECT, {
      eventId: event.id,
      reporterId: callerId,
      event,
    } as unknown as Report);
    if (!ability.can(REPORT_ACTIONS.CREATE, prospectiveReport)) {
      throw new ForbiddenException(REPORT_SERVICE_ERRORS.CREATE_FORBIDDEN(event.id));
    }
  }

  /** The caller's OPEN report on the target, if any: the row the partial unique indexes protect. */
  private findOpenReport(callerId: string, target: ReportTarget): Promise<Report | null> {
    return this.prisma.report.findFirst({
      where: {
        reporterId: callerId,
        status: ReportStatus.OPEN,
        eventId: target.eventId,
        targetType: target.targetType,
        // A photo is identified by its id alone; its uploader may have changed to null since.
        ...(target.photoId ? { photoId: target.photoId } : { reportedUserId: target.reportedUserId }),
      },
    });
  }

  /**
   * Creates the report, or returns the caller's OPEN report on the same target.
   * The partial unique indexes are the only duplicate check, on purpose: a
   * lookup before the insert would still lose to a concurrent submission.
   */
  private async createReport(
    callerId: string,
    target: ReportTarget,
    dto: CreateReportDto,
    context: EscalationContext,
  ): Promise<Report> {
    // `skipDuplicates` is ON CONFLICT DO NOTHING: of two submissions exactly
    // one inserts, and the other gets no row back instead of a unique
    // violation to catch.
    const [created] = await this.prisma.report.createManyAndReturn({
      data: [{ ...target, reporterId: callerId, reason: dto.reason, note: dto.note ?? null }],
      skipDuplicates: true,
    });
    if (!created) {
      const existing = await this.findOpenReport(callerId, target);
      // Only when that report was resolved between the insert and this lookup.
      if (!existing) throw new ConflictException(REPORT_SERVICE_ERRORS.CREATE_CONFLICT);
      return existing;
    }

    // Ids, reason and target type only: the note is free text and never logged.
    const fields = {
      reportId: created.id,
      eventId: created.eventId,
      callerId,
      targetType: created.targetType,
      photoId: created.photoId,
      reportedUserId: created.reportedUserId,
      reason: created.reason,
      audit: true,
    };
    this.logger.info({ event: "report.created", ...fields }, "Report created");

    const escalationReasons = await this.escalationReasonsFor(created, context);
    if (escalationReasons.length > 0) {
      // The event log-based alerting pages a human on (docs/moderation.md).
      this.logger.warn({ event: "report.escalated", ...fields, escalationReasons }, "Report needs platform attention");
    }

    return created;
  }

  private async escalationReasonsFor(report: Report, context: EscalationContext): Promise<ReportEscalationReason[]> {
    const reasons: ReportEscalationReason[] = [];

    if (SEVERE_REPORT_REASONS.includes(report.reason)) reasons.push(REPORT_ESCALATION_REASONS.SEVERE_REASON);
    if (context.reportedAccessLevel === AccessLevel.ORGANIZER) {
      reasons.push(REPORT_ESCALATION_REASONS.TARGET_IS_ORGANIZER);
    }
    if (report.photoId && context.hideThreshold !== undefined) {
      const openReports = await this.prisma.report.count({
        where: { photoId: report.photoId, status: ReportStatus.OPEN },
      });
      // Equality, so the report that tips the photo over is the one that says so.
      if (openReports === context.hideThreshold) reasons.push(REPORT_ESCALATION_REASONS.HIDE_THRESHOLD_REACHED);
    }

    return reasons;
  }
}
