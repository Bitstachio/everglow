import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AccessLevel,
  ReportActorRole,
  ReportClosedReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "../evidence/evidence.service";

/**
 * What the platform does to an event or an account (docs/moderation.md §8):
 * suspend and restore them, fix or delete an event. Each one closes the
 * reports it settles as the platform, and is audit-logged with the moderator.
 */
@Injectable()
export class PlatformEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly evidenceService: EvidenceService,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Hides the event from its members and makes it read-only. Its OPEN reports
   * about the event itself close as EVENT_SUSPENDED: this is the verdict on
   * them. Idempotent.
   */
  async suspendEvent(eventId: string, moderatorId: string): Promise<void> {
    const event = await this.findEvent(eventId);
    if (event.suspendedAt) return;

    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: eventId }, data: { suspendedAt: new Date() } });
      return tx.report.updateMany({
        where: { eventId, targetType: ReportTargetType.EVENT, status: ReportStatus.OPEN },
        data: this.closure(ReportStatus.ACTIONED, ReportClosedReason.EVENT_SUSPENDED, moderatorId),
      });
    });
    this.logger.info(
      { event: "event.suspended", eventId, moderatorId, closedReports: closed.count, audit: true },
      "Event suspended by the platform",
    );
  }

  /**
   * Lifts a suspension and a review together, and dismisses the OPEN reports
   * about the event itself: the event is fine as it is, or fine once fixed.
   */
  async restoreEvent(eventId: string, moderatorId: string): Promise<void> {
    await this.findEvent(eventId);

    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: eventId }, data: { suspendedAt: null, underReviewAt: null } });
      return tx.report.updateMany({
        where: { eventId, targetType: ReportTargetType.EVENT, status: ReportStatus.OPEN },
        data: this.closure(ReportStatus.DISMISSED, ReportClosedReason.DISMISSED, moderatorId),
      });
    });
    this.logger.info(
      { event: "event.restored", eventId, moderatorId, closedReports: closed.count, audit: true },
      "Event restored by the platform",
    );
  }

  /** A smaller fix to a reported event: its title, or its description. */
  async editEvent(
    eventId: string,
    moderatorId: string,
    edit: { title?: string; description?: string | null },
  ): Promise<void> {
    await this.findEvent(eventId);
    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(edit.title !== undefined && { title: edit.title }),
        ...(edit.description !== undefined && { description: edit.description }),
      },
    });
    this.logger.info(
      {
        event: "event.edited_by_platform",
        eventId,
        moderatorId,
        title: edit.title !== undefined,
        description: edit.description !== undefined,
        audit: true,
      },
      "Event edited by the platform",
    );
  }

  /** Removes a reported cover. Its evidence copy is made first, as for any reported object (§7). */
  async removeCover(eventId: string, moderatorId: string): Promise<void> {
    const event = await this.findEvent(eventId);
    if (!event.coverS3Key) return;

    const { deletable } = await this.evidenceService.preserveBeforeDelete([event.coverS3Key]);
    if (deletable.length > 0) await this.s3Service.deleteObject(event.coverS3Key);
    await this.prisma.event.updateMany({
      where: { id: eventId, coverS3Key: event.coverS3Key },
      data: { coverS3Key: null, coverUpdatedById: null },
    });
    this.logger.info({ event: "event.cover.removed_by_platform", eventId, moderatorId, audit: true }, "Cover removed");
  }

  /**
   * Deletes the event as the platform's verdict, whatever its state. Its OPEN
   * reports close first, as EVENT_DELETED, so they outlive it as a record
   * with the event's title. Then it goes as an organizer's delete does: rows
   * in the transaction, objects after, with evidence copies made first.
   */
  async deleteEvent(eventId: string, moderatorId: string): Promise<void> {
    await this.findEvent(eventId);

    const { photoKeys, coverKey, closedIds } = await this.prisma.$transaction(async (tx) => {
      const reports = await tx.report.updateManyAndReturn({
        where: { eventId, status: ReportStatus.OPEN },
        data: this.closure(ReportStatus.ACTIONED, ReportClosedReason.EVENT_DELETED, moderatorId),
        select: { id: true },
      });
      const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
      const deleted = await tx.event.delete({ where: { id: eventId } });
      return {
        photoKeys: photos.map((photo) => photo.s3Key),
        coverKey: deleted.coverS3Key,
        closedIds: reports.map((report) => report.id),
      };
    });
    const closed = closedIds.length;

    this.logger.info(
      {
        event: "event.deleted_by_platform",
        eventId,
        moderatorId,
        photoCount: photoKeys.length,
        closedReports: closed,
        audit: true,
      },
      "Event deleted by the platform",
    );
    await this.photoPurgeService.purgeObjects(coverKey ? [...photoKeys, coverKey] : photoKeys, {
      event: ALERT_EVENTS.EVENT_PHOTOS_PURGED,
      eventId,
      moderatorId,
    });
    // The purge copied every reported photo to evidence; an intimate image's
    // copy goes now, as with any removal of one (§7).
    await this.evidenceService.discardImages(closedIds);
  }

  /**
   * Suspends an account everywhere. Its OPEN member reports close as
   * ACCOUNT_SUSPENDED: this is the verdict on them. Reports on its photos stay
   * open, since closing them would show the photos again; the platform
   * removes those with its verdicts. Events it organizes alone are suspended
   * with it: nobody else could keep them in order. Idempotent.
   */
  async suspendUser(userId: string, moderatorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (!user) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", userId));
    if (user.suspendedAt) return;

    const organized = await this.prisma.eventAccess.findMany({
      where: { userId, accessLevel: AccessLevel.ORGANIZER },
      select: {
        eventId: true,
        event: { select: { _count: { select: { eventAccesses: { where: { accessLevel: AccessLevel.ORGANIZER } } } } } },
      },
    });
    const soleOrganized = organized
      .filter((access) => access.event._count.eventAccesses === 1)
      .map((access) => access.eventId);

    const now = new Date();
    const { closed, events } = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { suspendedAt: now } });
      const reports = await tx.report.updateMany({
        where: { reportedUserId: userId, targetType: ReportTargetType.MEMBER, status: ReportStatus.OPEN },
        data: this.closure(ReportStatus.ACTIONED, ReportClosedReason.ACCOUNT_SUSPENDED, moderatorId),
      });
      const suspended = await tx.event.updateMany({
        where: { id: { in: soleOrganized }, suspendedAt: null },
        data: { suspendedAt: now },
      });
      return { closed: reports.count, events: suspended.count };
    });
    this.logger.info(
      { event: "user.suspended", userId, moderatorId, closedReports: closed, eventsSuspended: events, audit: true },
      "Account suspended by the platform",
    );
  }

  /** Lifts an account's suspension. Events suspended with it stay suspended until restored one by one. */
  async unsuspendUser(userId: string, moderatorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (!user) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("User", "ID", userId));
    if (!user.suspendedAt) return;

    await this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: null } });
    this.logger.info({ event: "user.unsuspended", userId, moderatorId, audit: true }, "Account suspension lifted");
  }

  private async findEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, suspendedAt: true, coverS3Key: true },
    });
    if (!event) throw new NotFoundException(RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND("Event", "ID", eventId));
    return event;
  }

  private closure(status: ReportStatus, closedReason: ReportClosedReason, moderatorId: string) {
    return {
      status,
      closedReason,
      closedByRole: ReportActorRole.PLATFORM,
      resolvedById: moderatorId,
      resolvedAt: new Date(),
    };
  }
}
