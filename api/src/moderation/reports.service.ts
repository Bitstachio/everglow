import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AccessLevel,
  Event,
  EventAccess,
  PhotoStatus,
  Prisma,
  Report,
  ReportActorRole,
  ReportEscalation,
  ReportHoldReason,
  ReportQueue,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { authorize } from "src/casl/authorize";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ApiException } from "src/common/errors/api.exception";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { DEFAULT_PAGE_SIZE } from "src/common/pagination/pagination.constants";
import { KEYSET_ORDER_BY, KeysetPage, keysetAfter, toKeysetPage } from "src/common/pagination/keyset-cursor";
import { MEMBER_PHOTOS, type MemberPhotos, removeMemberInTransaction } from "src/events/event-membership";
import { eventWithCallerAccessInclude } from "src/events/events.types";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { GALLERY_STATES, galleryStateOf } from "src/plans/plans.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { EvidenceService, EvidenceSnapshot } from "./evidence/evidence.service";
import { ListReportsQueryDto } from "./dto/list-reports-query.dto";
import {
  REPORT_RESOLUTION_ACTIONS,
  RESOLUTION_CLOSED_REASON,
  RESOLUTION_STATUS,
  ReportResolutionAction,
  CHILD_SAFETY_HOLD_DAYS,
  PLATFORM_ONLY_REPORT_REASONS,
  SEVERE_REPORT_REASONS,
  STALE_REPORT_AFTER_HOURS,
  STALE_REPORT_SAMPLE_SIZE,
  reportHideThreshold,
  underReviewThreshold,
} from "./moderation.constants";
import { eventForPhotoVisibilityInclude } from "./moderation.types";
import { PhotoVisibilityService } from "./photo-visibility.service";
import { PLATFORM_ESCALATIONS, escalateToPlatform, escalationLogName, logEscalations } from "./report-escalation";
import { REPORT_ACTIONS, REPORT_SUBJECT } from "./reports.abilities";

/** What a new report points at; `photoId` is set for PHOTO reports only. */
interface ReportTarget extends Pick<Report, "targetType" | "photoId" | "reportedUserId"> {
  eventId: string;
  /** The event's title now, kept on the report after the event is gone. */
  eventTitle: string;
}

/** Facts about the target that decide whether a new report is escalated. */
interface EscalationContext {
  /** The reported user's role in the event; null when they are not a member or no longer exist. */
  reportedAccessLevel: AccessLevel | null;
  /** The event's hide threshold, for PHOTO reports. */
  hideThreshold?: number;
  /** An EVENT report: always the platform owner's to review. */
  targetIsEvent?: boolean;
  /** For an EVENT report, who set the event's current cover, if anyone. */
  coverUpdatedById?: string | null;
  /** For an EVENT report, the event's member count, which sets the under-review threshold. */
  memberCount?: number;
  /** The event's gallery has closed: organizers can no longer see its photos, so the platform handles it. */
  galleryClosed?: boolean;
}

export interface StaleReportCheckResult {
  /** Platform reports newly overdue this run: each is announced once. */
  stale: number;
  /** Reports the organizers left too long, moved to the platform this run. */
  movedToPlatform: number;
}

const isGalleryClosed = (event: Event): boolean => galleryStateOf(event) === GALLERY_STATES.CLOSED;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly photoVisibilityService: PhotoVisibilityService,
    private readonly s3Service: S3Service,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly evidenceService: EvidenceService,
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
      throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Photo", "ID", photoId));
    }

    await this.assertCanReportIn(photo.event, callerId);
    if (photo.addedById === callerId) throw new ApiException("CANNOT_REPORT_SELF");

    const target: ReportTarget = {
      eventId: photo.eventId,
      eventTitle: photo.event.title,
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
      if (!existing) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Photo", "ID", photoId));
      return existing;
    }

    const uploaderAccess = photo.addedById
      ? await this.prisma.eventAccess.findUnique({
          where: { userId_eventId: { userId: photo.addedById, eventId: photo.eventId } },
        })
      : null;

    return this.createReport(
      callerId,
      target,
      dto,
      {
        reportedAccessLevel: uploaderAccess?.accessLevel ?? null,
        hideThreshold: reportHideThreshold(photo.event._count.eventAccesses),
      },
      {
        objectS3Key: photo.s3Key,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
        subjectUserId: photo.addedById,
      },
    );
  }

  async reportMember(eventId: string, targetUserId: string, callerId: string, dto: CreateReportDto): Promise<Report> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });
    if (!event) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId));

    await this.assertCanReportIn(event, callerId);
    if (targetUserId === callerId) throw new ApiException("CANNOT_REPORT_SELF");
    // A member is not an image; the intimate-image reason is for a photo or a cover.
    if (dto.reason === ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE("reason", dto.reason, "used on photo and event reports only"),
      );
    }

    const targetAccess = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: targetUserId, eventId } },
    });
    if (!targetAccess) throw new ApiException("TARGET_NOT_A_MEMBER", { userId: targetUserId, eventId });

    const target: ReportTarget = {
      eventId,
      eventTitle: event.title,
      targetType: ReportTargetType.MEMBER,
      photoId: null,
      reportedUserId: targetUserId,
    };

    return this.createReport(
      callerId,
      target,
      dto,
      { reportedAccessLevel: targetAccess.accessLevel, galleryClosed: isGalleryClosed(event) },
      { subjectUserId: targetUserId },
    );
  }

  /**
   * A report about the event itself: its cover, title or description, or the
   * event as a whole. Any member may file one. It is always escalated and never
   * shown to the organizers, whose content it is about.
   */
  async reportEvent(eventId: string, callerId: string, dto: CreateReportDto): Promise<Report> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ...eventWithCallerAccessInclude(callerId), _count: { select: { eventAccesses: true } } },
    });
    if (!event) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId));

    await this.assertCanReportIn(event, callerId);

    const target: ReportTarget = {
      eventId,
      eventTitle: event.title,
      targetType: ReportTargetType.EVENT,
      photoId: null,
      reportedUserId: null,
    };

    return this.createReport(
      callerId,
      target,
      dto,
      {
        reportedAccessLevel: null,
        targetIsEvent: true,
        coverUpdatedById: event.coverUpdatedById,
        memberCount: event._count.eventAccesses,
        galleryClosed: isGalleryClosed(event),
      },
      // The cover is the one image an event report can be about.
      { objectS3Key: event.coverS3Key, subjectUserId: event.coverUpdatedById },
    );
  }

  async listReports(eventId: string, callerId: string, query: ListReportsQueryDto): Promise<KeysetPage<Report>> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });
    if (!event) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    // Listing is reading reports of the event; authorize against a prospective
    // row of a kind organizers review. The query below narrows to those kinds,
    // so reports about the event itself never appear here.
    const prospectiveReport = subject(REPORT_SUBJECT, {
      eventId,
      event,
      targetType: ReportTargetType.PHOTO,
    } as unknown as Report);
    authorize(ability, REPORT_ACTIONS.READ, prospectiveReport, {
      isMember: event.eventAccesses.length > 0,
      refusal: "ORGANIZER_ONLY",
    });

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

  /**
   * Applies an organizer's decision to a report (docs/moderation.md, "Resolving
   * a report"). Every action closes all OPEN reports on the same target, so one
   * decision settles what several members reported.
   */
  async resolveReport(
    reportId: string,
    callerId: string,
    action: ReportResolutionAction,
    memberPhotos?: MemberPhotos,
  ): Promise<Report> {
    if (memberPhotos && action !== REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE("photos", memberPhotos, "sent only with REMOVE_MEMBER"),
      );
    }

    const loaded = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { event: { include: eventWithCallerAccessInclude(callerId) } },
    });
    // A report whose event is gone is a record, not a queue item: it closed
    // before the event could be deleted, and nobody in an event can reach it.
    if (!loaded?.event) {
      throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Report", "ID", reportId));
    }
    const event = loaded.event;

    const ability = await this.abilityFactory.createForCaller(callerId);
    // Reports about the event itself are the platform's: organizers can't even
    // list them, so a member resolving one by id gets the bare 403.
    authorize(
      ability,
      REPORT_ACTIONS.UPDATE,
      subject(REPORT_SUBJECT, loaded),
      // Reports about the event itself, and child-safety and intimate-image
      // reports, are the platform's: an organizer gets the bare 403.
      loaded.targetType === ReportTargetType.EVENT || PLATFORM_ONLY_REPORT_REASONS.includes(loaded.reason)
        ? undefined
        : { isMember: event.eventAccesses.length > 0, refusal: "ORGANIZER_ONLY" },
    );

    // The platform's reports are the platform's (docs/moderation.md §3). An
    // organizer can't judge a report about themselves or their own photo, nor
    // one they filed, for instance before they were promoted.
    if (loaded.queue === ReportQueue.PLATFORM) throw new ApiException("REPORT_ESCALATED", { reportId });
    if (loaded.reportedUserId === callerId || loaded.reporterId === callerId) {
      throw new ApiException("CANNOT_RESOLVE_OWN_REPORT", { reportId });
    }

    const photo = await this.photoToRemove(loaded, action);
    const removedMemberId = action === REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER ? loaded.reportedUserId : null;
    if (action === REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER && !removedMemberId) {
      throw new ApiException("REPORTED_MEMBER_GONE", { reportId });
    }

    const resolution = {
      status: RESOLUTION_STATUS[action],
      closedReason: RESOLUTION_CLOSED_REASON[action],
      closedByRole: ReportActorRole.ORGANIZER,
      resolvedById: callerId,
      resolvedAt: new Date(),
    };
    const sameTarget = this.sameTargetWhere(loaded, action);
    const dismissing = action === REPORT_RESOLUTION_ACTIONS.DISMISS;

    // Only what this organizer may close: reports still with the organizers,
    // and, for a dismissal, not their own. A removal settles their own report
    // too, since what it was about is gone either way.
    const closable: Prisma.ReportWhereInput[] = [
      { id: { not: reportId } },
      { status: ReportStatus.OPEN },
      { queue: ReportQueue.ORGANIZERS },
      // `NOT reporterId = caller` would drop reports whose reporter is gone
      // (null), and leave them open: spell the null out.
      ...(dismissing ? [{ OR: [{ reporterId: null }, { reporterId: { not: callerId } }] }] : []),
    ];

    if (dismissing && SEVERE_REPORT_REASONS.includes(loaded.reason)) {
      return this.dismissSevere(loaded, callerId, sameTarget, closable);
    }

    const { resolved, closedReports, removedMember, severeMoved } = await this.prisma.$transaction(async (tx) => {
      // Guarded on OPEN and the queue so that, of two organizers acting at
      // once, one wins and the other is told, instead of both removing things.
      const [acted] = await tx.report.updateManyAndReturn({
        where: { id: reportId, status: ReportStatus.OPEN, queue: ReportQueue.ORGANIZERS },
        data: resolution,
      });
      if (!acted) throw new ApiException("REPORT_ALREADY_RESOLVED", { reportId });

      // A dismissal never closes a severe report: those go to the platform.
      const severeToPlatform =
        dismissing && sameTarget
          ? await tx.report.findMany({
              where: { AND: [...closable, sameTarget, { reason: { in: [...SEVERE_REPORT_REASONS] } }] },
              select: { id: true },
            })
          : [];
      const moved = await escalateToPlatform(
        tx,
        severeToPlatform.map((report) => report.id),
        ReportEscalation.SEVERE_DISMISSED,
      );

      const others = sameTarget
        ? await tx.report.updateMany({
            where: {
              AND: [
                ...closable,
                sameTarget,
                ...(dismissing ? [{ reason: { notIn: [...SEVERE_REPORT_REASONS] } }] : []),
              ],
            },
            data: resolution,
          })
        : { count: 0 };

      // Rows first, inside the transaction; the photo's object goes after the
      // commit (below), as in an event delete.
      if (photo) await tx.photo.deleteMany({ where: { id: photo.id } });
      // The same removal as the participant endpoint: membership, ban, and
      // with DELETE the member's other photos in the event.
      const member = removedMemberId
        ? await removeMemberInTransaction(tx, {
            eventId: event.id,
            userId: removedMemberId,
            removedById: callerId,
            removedByRole: ReportActorRole.ORGANIZER,
            photos: memberPhotos ?? MEMBER_PHOTOS.KEEP,
            excludePhotoIds: photo ? [photo.id] : [],
          })
        : null;

      return { resolved: acted, closedReports: others.count + 1, removedMember: member, severeMoved: moved };
    });
    logEscalations(this.logger, severeMoved, ReportEscalation.SEVERE_DISMISSED, { callerId });
    logEscalations(this.logger, removedMember?.reportsEscalated ?? [], ReportEscalation.TARGET_DELETED, { callerId });

    if (photo) await this.deletePhotoObject(photo, reportId);
    if (removedMember) {
      await this.photoPurgeService.purgeObjects(removedMember.photoKeys, {
        event: ALERT_EVENTS.EVENT_MEMBER_PHOTOS_PURGED,
        eventId: resolved.eventId,
        callerId,
        targetUserId: removedMemberId,
        reportId,
      });
    }

    this.logger.info(
      {
        event: "report.resolved",
        reportId,
        eventId: resolved.eventId,
        callerId,
        targetType: resolved.targetType,
        photoId: resolved.photoId,
        reportedUserId: resolved.reportedUserId,
        action,
        resolution: resolution.status,
        closedReason: resolution.closedReason,
        closedByRole: resolution.closedByRole,
        closedReports,
        removedPhotoId: photo?.id ?? null,
        removedMemberId,
        memberPhotos: removedMemberId ? (memberPhotos ?? MEMBER_PHOTOS.KEEP) : null,
        memberPhotosDeleted: removedMember?.photosDeleted ?? 0,
        audit: true,
      },
      "Report resolved",
    );

    return resolved;
  }

  /**
   * An organizer dismissing a severe report hands it to the platform instead
   * of closing it (docs/moderation.md §3): the photo stays hidden until the
   * platform has looked. Severe reports on the same target go with it; the
   * others are dismissed.
   */
  private async dismissSevere(
    loaded: Report,
    callerId: string,
    sameTarget: Prisma.ReportWhereInput | null,
    closable: Prisma.ReportWhereInput[],
  ): Promise<Report> {
    const reportId = loaded.id;
    const { moved, dismissed } = await this.prisma.$transaction(async (tx) => {
      const severeOthers = sameTarget
        ? await tx.report.findMany({
            where: { AND: [...closable, sameTarget, { reason: { in: [...SEVERE_REPORT_REASONS] } }] },
            select: { id: true },
          })
        : [];
      const escalated = await escalateToPlatform(
        tx,
        [reportId, ...severeOthers.map((report) => report.id)],
        ReportEscalation.SEVERE_DISMISSED,
      );
      // Guarded like a verdict: if the report itself didn't move, someone else
      // acted on it first.
      if (!escalated.some((report) => report.id === reportId)) {
        throw new ApiException("REPORT_ALREADY_RESOLVED", { reportId });
      }

      const others = sameTarget
        ? await tx.report.updateMany({
            where: { AND: [...closable, sameTarget, { reason: { notIn: [...SEVERE_REPORT_REASONS] } }] },
            data: {
              status: ReportStatus.DISMISSED,
              closedReason: RESOLUTION_CLOSED_REASON.DISMISS,
              closedByRole: ReportActorRole.ORGANIZER,
              resolvedById: callerId,
              resolvedAt: new Date(),
            },
          })
        : { count: 0 };
      return { moved: escalated, dismissed: others.count };
    });

    logEscalations(this.logger, moved, ReportEscalation.SEVERE_DISMISSED, { callerId });
    this.logger.info(
      {
        event: "report.resolved",
        reportId,
        eventId: loaded.eventId,
        callerId,
        targetType: loaded.targetType,
        photoId: loaded.photoId,
        reportedUserId: loaded.reportedUserId,
        action: REPORT_RESOLUTION_ACTIONS.DISMISS,
        resolution: "ESCALATED",
        closedReports: dismissed,
        escalatedReports: moved.length,
        audit: true,
      },
      "Severe report dismissed by an organizer; moved to the platform",
    );

    return this.prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  }

  /**
   * The hourly check (docs/moderation.md §3, §9), in two steps:
   *
   * 1. Reports the organizers have left OPEN for STALE_REPORT_AFTER_HOURS move
   *    to the platform (ORGANIZER_TIMEOUT).
   * 2. Platform reports waiting longer than that since they got there are
   *    announced once, in one `report.stale` line, and marked so the next run
   *    doesn't repeat them.
   */
  async reportStaleReports(now: Date = new Date()): Promise<StaleReportCheckResult> {
    const cutoff = new Date(now.getTime() - STALE_REPORT_AFTER_HOURS * 60 * 60 * 1000);

    const timedOut = await this.prisma.report.findMany({
      where: { status: ReportStatus.OPEN, queue: ReportQueue.ORGANIZERS, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const moved = await escalateToPlatform(
      this.prisma,
      timedOut.map((report) => report.id),
      ReportEscalation.ORGANIZER_TIMEOUT,
    );
    logEscalations(this.logger, moved, ReportEscalation.ORGANIZER_TIMEOUT);

    const overdue = {
      status: ReportStatus.OPEN,
      queue: ReportQueue.PLATFORM,
      escalatedAt: { lt: cutoff },
      overdueAlertedAt: null,
    };
    const [stale, oldest] = await Promise.all([
      this.prisma.report.count({ where: overdue }),
      this.prisma.report.findMany({
        where: overdue,
        orderBy: { escalatedAt: "asc" },
        take: STALE_REPORT_SAMPLE_SIZE,
        select: { id: true, eventId: true, escalatedAt: true },
      }),
    ]);

    if (stale > 0) {
      this.logger.warn(
        {
          event: ALERT_EVENTS.REPORT_STALE,
          stale,
          staleAfterHours: STALE_REPORT_AFTER_HOURS,
          oldestEscalatedAt: oldest[0]?.escalatedAt,
          reportIds: oldest.map((report) => report.id),
          eventIds: [...new Set(oldest.flatMap((report) => (report.eventId ? [report.eventId] : [])))],
          audit: true,
        },
        "Platform reports have waited longer than the response window",
      );
      await this.prisma.report.updateMany({ where: overdue, data: { overdueAlertedAt: now } });
    }

    return { stale, movedToPlatform: moved.length };
  }

  /**
   * A platform moderator's verdict (docs/moderation.md §8): the organizer
   * verdicts, on any OPEN report in either queue. It closes every OPEN report
   * on the same target, whoever filed it and in whichever queue. On a photo
   * that is already gone, REMOVE_PHOTO upholds the reports. A report about the
   * event itself takes DISMISS only. Removing an intimate image also deletes
   * its evidence copy: only the hash is kept (§7).
   */
  async resolveAsPlatform(
    reportId: string,
    moderatorId: string,
    action: ReportResolutionAction,
    memberPhotos?: MemberPhotos,
  ): Promise<Report> {
    if (memberPhotos && action !== REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE("photos", memberPhotos, "sent only with REMOVE_MEMBER"),
      );
    }

    const loaded = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { evidence: { select: { objectS3Key: true } } },
    });
    if (!loaded) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Report", "ID", reportId));
    if (loaded.status !== ReportStatus.OPEN) throw new ApiException("REPORT_ALREADY_RESOLVED", { reportId });
    if (loaded.targetType === ReportTargetType.EVENT && action !== REPORT_RESOLUTION_ACTIONS.DISMISS) {
      throw new BadRequestException(
        RESPONSE_TEMPLATES.INVALID_VALUE("action", action, "DISMISS for a report about the event itself"),
      );
    }
    if (action === REPORT_RESOLUTION_ACTIONS.REMOVE_PHOTO && loaded.targetType !== ReportTargetType.PHOTO) {
      throw new BadRequestException(RESPONSE_TEMPLATES.INVALID_VALUE("action", action, "used on photo reports only"));
    }

    const removes = action !== REPORT_RESOLUTION_ACTIONS.DISMISS;
    const photo =
      removes && loaded.targetType === ReportTargetType.PHOTO && loaded.photoId
        ? await this.prisma.photo.findUnique({ where: { id: loaded.photoId }, select: { id: true, s3Key: true } })
        : null;
    const removedMemberId = action === REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER ? loaded.reportedUserId : null;
    if (action === REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER && (!removedMemberId || !loaded.eventId)) {
      throw new ApiException("REPORTED_MEMBER_GONE", { reportId });
    }

    // Reports on a photo that is gone have lost their photoId; their snapshots
    // still name the object, which is how they are found together.
    const sameTarget =
      loaded.targetType === ReportTargetType.PHOTO && !loaded.photoId && loaded.evidence?.objectS3Key
        ? { evidence: { is: { objectS3Key: loaded.evidence.objectS3Key } } }
        : this.sameTargetWhere(loaded, action);
    const resolution = {
      status: RESOLUTION_STATUS[action],
      closedReason: RESOLUTION_CLOSED_REASON[action],
      closedByRole: ReportActorRole.PLATFORM,
      resolvedById: moderatorId,
      resolvedAt: new Date(),
    };

    const { resolved, closedIds, removedMember } = await this.prisma.$transaction(async (tx) => {
      const [acted] = await tx.report.updateManyAndReturn({
        where: { id: reportId, status: ReportStatus.OPEN },
        data: resolution,
      });
      if (!acted) throw new ApiException("REPORT_ALREADY_RESOLVED", { reportId });

      const others = sameTarget
        ? await tx.report.updateManyAndReturn({
            where: { AND: [{ id: { not: reportId } }, { status: ReportStatus.OPEN }, sameTarget] },
            data: resolution,
            select: { id: true },
          })
        : [];

      if (photo) await tx.photo.deleteMany({ where: { id: photo.id } });
      const member = removedMemberId
        ? await removeMemberInTransaction(tx, {
            eventId: loaded.eventId!,
            userId: removedMemberId,
            removedById: moderatorId,
            removedByRole: ReportActorRole.PLATFORM,
            photos: memberPhotos ?? MEMBER_PHOTOS.KEEP,
            excludePhotoIds: photo ? [photo.id] : [],
          })
        : null;

      return { resolved: acted, closedIds: [reportId, ...others.map((other) => other.id)], removedMember: member };
    });

    if (photo) await this.deletePhotoObject(photo, reportId);
    if (removedMember) {
      await this.photoPurgeService.purgeObjects(removedMember.photoKeys, {
        event: ALERT_EVENTS.EVENT_MEMBER_PHOTOS_PURGED,
        eventId: resolved.eventId,
        moderatorId,
        targetUserId: removedMemberId,
        reportId,
      });
    }
    // Any intimate-image report this removal closed loses its evidence copy;
    // the others, and held ones, keep theirs (EvidenceService.discardImages).
    if (removes) await this.evidenceService.discardImages(closedIds);

    this.logger.info(
      {
        event: "report.resolved",
        reportId,
        eventId: resolved.eventId,
        moderatorId,
        targetType: resolved.targetType,
        photoId: resolved.photoId,
        reportedUserId: resolved.reportedUserId,
        action,
        resolution: resolution.status,
        closedReason: resolution.closedReason,
        closedByRole: resolution.closedByRole,
        closedReports: closedIds.length,
        removedPhotoId: photo?.id ?? null,
        removedMemberId,
        audit: true,
      },
      "Report resolved by the platform",
    );

    return resolved;
  }

  /**
   * The photo a resolution deletes: the reported photo for REMOVE_PHOTO, and
   * for REMOVE_MEMBER too when the report is about a photo, since closing its
   * reports would otherwise make it visible again.
   */
  private async photoToRemove(
    report: Report,
    action: ReportResolutionAction,
  ): Promise<{ id: string; s3Key: string } | null> {
    if (action === REPORT_RESOLUTION_ACTIONS.REMOVE_PHOTO && report.targetType !== ReportTargetType.PHOTO) {
      throw new BadRequestException(RESPONSE_TEMPLATES.INVALID_VALUE("action", action, "used on photo reports only"));
    }
    if (action === REPORT_RESOLUTION_ACTIONS.DISMISS || report.targetType !== ReportTargetType.PHOTO) return null;

    const photo = report.photoId
      ? await this.prisma.photo.findUnique({ where: { id: report.photoId }, select: { id: true, s3Key: true } })
      : null;
    if (!photo && action === REPORT_RESOLUTION_ACTIONS.REMOVE_PHOTO) {
      throw new ApiException("REPORTED_PHOTO_GONE", { reportId: report.id });
    }
    return photo;
  }

  /**
   * The other OPEN reports one decision settles: every report on the same
   * photo, or for REMOVE_MEMBER every report about that member in the event.
   * Null when the target is gone and only the report acted on can close.
   */
  private sameTargetWhere(report: Report, action: ReportResolutionAction): Prisma.ReportWhereInput | null {
    if (action === REPORT_RESOLUTION_ACTIONS.REMOVE_MEMBER) {
      return report.reportedUserId ? { eventId: report.eventId, reportedUserId: report.reportedUserId } : null;
    }
    if (report.targetType === ReportTargetType.PHOTO) {
      return report.photoId ? { photoId: report.photoId } : null;
    }
    return report.reportedUserId
      ? { eventId: report.eventId, targetType: ReportTargetType.MEMBER, reportedUserId: report.reportedUserId }
      : null;
  }

  // Best effort, like the event delete purge: the row is gone, so what is left
  // at stake is storage cost, which the S3 orphan reconciler also covers.
  private async deletePhotoObject(photo: { id: string; s3Key: string }, reportId: string): Promise<void> {
    try {
      // Copied to evidence first; a failed copy keeps the original for the evidence job.
      const { deletable } = await this.evidenceService.preserveBeforeDelete([photo.s3Key]);
      if (deletable.length > 0) await this.s3Service.deleteObject(photo.s3Key);
    } catch (error) {
      this.logger.warn(
        { err: error as Error, event: "report.photo_object_retained", reportId, photoId: photo.id },
        "Removed photo's object could not be deleted from S3; the orphan reconciler will reclaim it",
      );
    }
  }

  private async assertCanReportIn(event: Event & { eventAccesses: EventAccess[] }, callerId: string): Promise<void> {
    const ability = await this.abilityFactory.createForCaller(callerId);
    // The report does not exist yet, so authorize against a prospective row.
    const prospectiveReport = subject(REPORT_SUBJECT, {
      eventId: event.id,
      reporterId: callerId,
      event,
    } as unknown as Report);
    authorize(ability, REPORT_ACTIONS.CREATE, prospectiveReport);
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
   * Creates the report with its evidence snapshot, or returns the caller's
   * OPEN report on the same target. The partial unique indexes are the only
   * duplicate check, on purpose: a lookup before the insert would still lose
   * to a concurrent submission.
   */
  private async createReport(
    callerId: string,
    target: ReportTarget,
    dto: CreateReportDto,
    context: EscalationContext,
    snapshot: EvidenceSnapshot,
  ): Promise<Report> {
    // Where it starts is decided before the insert, from facts known now: a
    // report about the event, about an organizer, or in a closed gallery is the
    // platform's from the start (docs/moderation.md §3).
    const routing = await this.routingReasonsFor(dto.reason, target.eventId, context);
    const toPlatform = routing.some((reason) => PLATFORM_ESCALATIONS.includes(reason));

    // `skipDuplicates` is ON CONFLICT DO NOTHING: of two submissions exactly
    // one inserts, and the other gets no row back instead of a unique
    // violation to catch. The snapshot is written in the same transaction, so
    // no report exists without one (docs/moderation.md §7).
    const inserted = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.report.createManyAndReturn({
        data: [
          {
            ...target,
            reporterId: callerId,
            reason: dto.reason,
            note: dto.note ?? null,
            queue: toPlatform ? ReportQueue.PLATFORM : ReportQueue.ORGANIZERS,
            escalatedAt: toPlatform ? new Date() : null,
            escalationReasons: routing,
            // A child-safety report is held from the start, so its evidence
            // outlives any delete until the platform has decided (§7).
            ...(dto.reason === ReportReason.CHILD_SAFETY && {
              holdUntil: new Date(Date.now() + CHILD_SAFETY_HOLD_DAYS * 24 * 60 * 60 * 1000),
              holdReason: ReportHoldReason.CHILD_SAFETY,
            }),
          },
        ],
        skipDuplicates: true,
      });
      if (row) await this.evidenceService.writeSnapshot(tx, row.id, snapshot);
      return row;
    });
    if (!inserted) {
      const existing = await this.findOpenReport(callerId, target);
      // Only when that report was resolved between the insert and this lookup.
      if (!existing) throw new ApiException("REPORT_CHANGED_CONCURRENTLY");
      return existing;
    }

    // What this report did once it was counted: tipped a photo over its hide
    // threshold, or put the event under review. Recorded, but it doesn't move
    // the report: hiding and reviewing already protect the members.
    const consequences = await this.consequenceReasonsFor(inserted, target.eventId, context);
    if (consequences.length > 0) {
      await this.prisma.report.update({
        where: { id: inserted.id },
        data: { escalationReasons: { push: consequences } },
      });
    }
    const created = { ...inserted, escalationReasons: [...inserted.escalationReasons, ...consequences] };

    // Ids, reason and target type only: the note is free text and never logged.
    const fields = {
      reportId: created.id,
      eventId: created.eventId,
      callerId,
      targetType: created.targetType,
      photoId: created.photoId,
      reportedUserId: created.reportedUserId,
      reason: created.reason,
      queue: created.queue,
      // Whose cover it is, so the reviewer of an event report knows where to look.
      ...(context.targetIsEvent && { coverUpdatedById: context.coverUpdatedById ?? null }),
      audit: true,
    };
    this.logger.info({ event: "report.created", ...fields }, "Report created");

    const escalationReasons = [...routing, ...consequences];
    if (escalationReasons.length > 0) {
      // The event the platform owner's alert rule keys off (docs/alerting.md §3).
      this.logger.warn(
        {
          event: ALERT_EVENTS.REPORT_ESCALATED,
          ...fields,
          escalationReasons: escalationReasons.map(escalationLogName),
        },
        "Report needs platform attention",
      );
    }

    return created;
  }

  /** The reasons known before the report exists: they decide its queue. */
  private async routingReasonsFor(
    reason: ReportReason,
    eventId: string,
    context: EscalationContext,
  ): Promise<ReportEscalation[]> {
    const reasons: ReportEscalation[] = [];

    if (SEVERE_REPORT_REASONS.includes(reason)) reasons.push(ReportEscalation.SEVERE_REASON);
    if (reason === ReportReason.CHILD_SAFETY) reasons.push(ReportEscalation.CHILD_SAFETY);
    if (reason === ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE) reasons.push(ReportEscalation.INTIMATE_IMAGE);
    if (context.targetIsEvent) reasons.push(ReportEscalation.TARGET_IS_EVENT);
    if (context.reportedAccessLevel === AccessLevel.ORGANIZER) {
      reasons.push(ReportEscalation.TARGET_IS_ORGANIZER);
      // Nobody in the event could resolve a report about its only organizer.
      const organizers = await this.prisma.eventAccess.count({
        where: { eventId, accessLevel: AccessLevel.ORGANIZER },
      });
      if (organizers === 1) reasons.push(ReportEscalation.TARGET_IS_SOLE_ORGANIZER);
    }
    if (context.galleryClosed) reasons.push(ReportEscalation.GALLERY_CLOSED);

    return reasons;
  }

  /** The reasons that follow from counting the new report. */
  private async consequenceReasonsFor(
    report: Report,
    eventId: string,
    context: EscalationContext,
  ): Promise<ReportEscalation[]> {
    const reasons: ReportEscalation[] = [];

    if (report.photoId && context.hideThreshold !== undefined) {
      const openReports = await this.prisma.report.count({
        where: { photoId: report.photoId, status: ReportStatus.OPEN },
      });
      // Equality, so the report that tips the photo over is the one that says so.
      if (openReports === context.hideThreshold) reasons.push(ReportEscalation.HIDE_THRESHOLD_REACHED);
    }
    if (context.targetIsEvent && context.memberCount !== undefined) {
      if (await this.putUnderReviewAtThreshold(eventId, context.memberCount)) {
        reasons.push(ReportEscalation.EVENT_UNDER_REVIEW);
      }
    }

    return reasons;
  }

  /**
   * Puts the event under review once its OPEN event reports reach
   * `underReviewThreshold`; each is by a different member
   * (Report_reporterId_eventId_key), so the rows are at most one per member.
   * Returns whether this call did it: the update only matches an event not
   * already under review, so of two reports that cross the threshold together
   * exactly one says so. Only the platform lifts it.
   */
  private async putUnderReviewAtThreshold(eventId: string, memberCount: number): Promise<boolean> {
    const openReports = await this.prisma.report.findMany({
      where: { eventId, targetType: ReportTargetType.EVENT, status: ReportStatus.OPEN },
      select: { reason: true },
    });
    const severity = openReports.some((open) => PLATFORM_ONLY_REPORT_REASONS.includes(open.reason))
      ? "platform_only"
      : openReports.some((open) => SEVERE_REPORT_REASONS.includes(open.reason))
        ? "severe"
        : "none";
    if (openReports.length < underReviewThreshold(memberCount, severity)) return false;

    const { count } = await this.prisma.event.updateMany({
      where: { id: eventId, underReviewAt: null },
      data: { underReviewAt: new Date() },
    });
    return count === 1;
  }
}
