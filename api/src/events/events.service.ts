import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { AccessLevel, Event, EventInvite, Prisma } from "generated/prisma/client";
import { EventPlanService, galleryNotClosed } from "src/plans/event-plan.service";
import {
  GALLERY_STATES,
  gallerySchedule,
  galleryStateOf,
  PLAN_LIMIT_CODES,
  PLAN_LIMIT_MESSAGES,
} from "src/plans/plans.constants";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { ImageUploadService } from "src/images/image-upload.service";
import { PhotoPurgeService } from "src/photos/photo-purge.service";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { MEMBER_PHOTOS, MemberPhotos, removeMemberInTransaction } from "./event-membership";
import { EVENT_INVITE_ACCESS_LEVELS, EventInviteAccessLevel, isInviteAccessLevel } from "./events.invitation";
import { deleteUploadsInTransaction } from "src/photos/photo-deletion";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import {
  EVENT_DATE_MAX_MONTHS_AHEAD,
  EVENT_SERVICE_ERRORS,
  EVENT_UNDER_REVIEW_CODE,
  latestEventDate,
  ORGANIZER_BLOCKED_BY_CALLER_CODE,
  REMOVED_FROM_EVENT_CODE,
} from "./events.constants";
import {
  EventAccessWithUser,
  EventBanWithUser,
  EventParticipant,
  eventAccessWithUserInclude,
  eventBanWithUserInclude,
  eventWithCallerAccessInclude,
} from "./events.types";

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly imageUploads: ImageUploadService,
    private readonly eventPlanService: EventPlanService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async create(creatorId: string, dto: CreateEventDto): Promise<Event> {
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      include: userWithDetailsInclude,
    });

    if (!creator) throw new NotFoundException(EVENT_SERVICE_ERRORS.CREATOR_NOT_FOUND(creatorId));
    if (!creator.details) throw new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);

    const ability = this.abilityFactory.createForUser({ id: creatorId, isOnboarded: !!creator.details });
    if (!ability.can(EVENT_ACTIONS.CREATE, EVENT_SUBJECT)) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.CREATE_FORBIDDEN);
    }

    const participantToken = randomUUID();
    const now = new Date();
    const date = new Date(dto.date);
    this.assertDateInRange(date, now);
    // The gallery stays open for the length the host picked from the plan's
    // options, from the event's date on (docs/event-quotas.md).
    const plan = await this.eventPlanService.newEventPlan(creatorId);
    const galleryWindowDays = this.eventPlanService.resolveGalleryWindow(plan, dto.galleryWindowDays);

    // The active-event check and the insert share a transaction, so two
    // creates by the same person can't both pass it (docs/event-quotas.md).
    const event = await this.prisma.$transaction(async (tx) => {
      await this.eventPlanService.assertCanCreateEvent(tx, creatorId);
      return tx.event.create({
        data: {
          title: dto.title,
          date,
          planId: plan.id,
          galleryWindowDays,
          ...gallerySchedule(date, galleryWindowDays, now),
          creatorId,
          invitationUrl: participantToken,
          ...(dto.description !== undefined && { description: dto.description }),
          eventAccesses: {
            create: {
              userId: creatorId,
              accessLevel: AccessLevel.ORGANIZER,
            },
          },
          invites: {
            create: [
              { token: participantToken, accessLevel: AccessLevel.PARTICIPANT },
              { token: randomUUID(), accessLevel: AccessLevel.VIEWER },
            ],
          },
        },
      });
    });

    this.logger.info(
      { event: "event.created", eventId: event.id, creatorId, galleryWindowDays, galleryOpensAt: event.galleryOpensAt },
      "Event created",
    );

    return event;
  }

  async findAllForUser(userId: string): Promise<Event[]> {
    const ability = await this.abilityFactory.createForCaller(userId);
    // Checking against the subject type matches when any read rule exists,
    // which is false only for callers who have not completed onboarding.
    if (!ability.can(EVENT_ACTIONS.READ, EVENT_SUBJECT)) return [];

    return this.prisma.event.findMany({
      where: accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT) as Prisma.EventWhereInput,
      orderBy: { date: "asc" },
    });
  }

  async joinByInvitationUrl(callerId: string, invitationUrl: string): Promise<Event> {
    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      include: userWithDetailsInclude,
    });

    if (!caller) throw new NotFoundException(EVENT_SERVICE_ERRORS.CALLER_NOT_FOUND(callerId));
    if (!caller.details) throw new UnprocessableEntityException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);

    const invite = await this.prisma.eventInvite.findUnique({ where: { token: invitationUrl } });
    // Organizer links no longer exist; one that slipped through reads as unknown.
    if (!invite || !isInviteAccessLevel(invite.accessLevel)) {
      throw new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invitationUrl));
    }

    const event = await this.prisma.event.findUnique({ where: { id: invite.eventId } });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invitationUrl));

    const existing = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: callerId, eventId: event.id } },
    });
    if (existing) throw new ConflictException(EVENT_SERVICE_ERRORS.ALREADY_JOINED(event.id));

    // A closed event can't be joined: its photos are gone, and it stays only
    // as a record for the people who were there (docs/event-quotas.md). An
    // upcoming one can. Checked first, since it is true for everyone whatever
    // else applies.
    this.eventPlanService.assertGalleryNotClosed(event);

    // Removed by an organizer: said plainly, since they already know. Checked
    // before blocks so a removed member is not told about a block instead.
    const ban = await this.prisma.eventBan.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: callerId } },
    });
    if (ban) {
      throw new ForbiddenException({ code: REMOVED_FROM_EVENT_CODE, message: EVENT_SERVICE_ERRORS.REMOVED_FROM_EVENT });
    }

    // Under review: members keep access, but no one new comes in until the
    // platform has looked (docs/moderation.md).
    if (event.underReviewAt) {
      throw new ForbiddenException({ code: EVENT_UNDER_REVIEW_CODE, message: EVENT_SERVICE_ERRORS.UNDER_REVIEW });
    }

    await this.assertNoBlockWithOrganizers(event.id, invitationUrl, callerId);

    // The member check and the insert share a transaction, so two joins to a
    // nearly full event can't both pass it (docs/event-quotas.md).
    await this.prisma.$transaction(async (tx) => {
      await this.eventPlanService.assertCanJoin(tx, event);
      await tx.eventAccess.create({
        data: {
          userId: callerId,
          eventId: event.id,
          accessLevel: invite.accessLevel,
        },
      });
    });

    this.logger.info(
      { event: "event.joined", eventId: event.id, callerId, accessLevel: invite.accessLevel },
      "User joined event via invitation URL",
    );

    return event;
  }

  /**
   * Blocks between the joiner and the event's organizers, in one query. An
   * organizer's block on the joiner reads as the same 404 as an unknown link,
   * so a block is never revealed to the person blocked. The joiner's own block
   * on an organizer is explained, since they made it and can undo it. Blocks
   * between the joiner and ordinary members do not stop a join
   * (docs/moderation.md).
   */
  private async assertNoBlockWithOrganizers(eventId: string, invitationUrl: string, callerId: string): Promise<void> {
    const organizerOfThisEvent = { eventAccesses: { some: { eventId, accessLevel: AccessLevel.ORGANIZER } } };
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockedId: callerId, blocker: organizerOfThisEvent },
          { blockerId: callerId, blocked: organizerOfThisEvent },
        ],
      },
      select: { blockerId: true, blocked: { select: { details: { select: { name: true } } } } },
    });

    if (blocks.some((block) => block.blockerId !== callerId)) {
      throw new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invitationUrl));
    }

    const ownBlock = blocks.find((block) => block.blockerId === callerId);
    if (ownBlock) {
      throw new ForbiddenException({
        code: ORGANIZER_BLOCKED_BY_CALLER_CODE,
        message: EVENT_SERVICE_ERRORS.ORGANIZER_BLOCKED_BY_CALLER(ownBlock.blocked.details?.name ?? null),
      });
    }
  }

  async findOne(eventId: string, callerId: string): Promise<Event> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    const { eventAccesses, ...event } = loaded;
    void eventAccesses;
    return event;
  }

  /**
   * The event, once the caller is known to be allowed to update it (its
   * organizers). Everything that manages an event goes through here, so a
   * missing event is 404 and a caller without the ability is 403 everywhere.
   */
  async getUpdatable(eventId: string, callerId: string): Promise<Event> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.UPDATE, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));
    }

    const { eventAccesses, ...event } = loaded;
    void eventAccesses;
    return event;
  }

  async update(eventId: string, callerId: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.getUpdatable(eventId, callerId);
    const schedule = await this.rescheduleFor(event, dto, new Date());

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...schedule,
      },
    });

    this.logger.info({ event: "event.updated", eventId, callerId, fields: Object.keys(dto) }, "Event updated");

    return updated;
  }

  /**
   * The new date and gallery schedule an update asks for, or nothing when it
   * changes neither: sending the current values is not a change. Both can
   * change only while the event is upcoming. Once its gallery opens they are
   * locked: a later date would lengthen a gallery people already use, and a
   * closed one never reopens (docs/event-quotas.md). The title, description
   * and cover can always change.
   */
  private async rescheduleFor(event: Event, dto: UpdateEventDto, now: Date): Promise<Prisma.EventUpdateInput> {
    const date = dto.date === undefined ? event.date : new Date(dto.date);
    const galleryWindowDays = dto.galleryWindowDays === undefined ? event.galleryWindowDays : dto.galleryWindowDays;
    if (date.getTime() === event.date.getTime() && galleryWindowDays === event.galleryWindowDays) return {};

    if (galleryStateOf(event, now) !== GALLERY_STATES.UPCOMING) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_CODES.EVENT_SCHEDULE_LOCKED,
        message: PLAN_LIMIT_MESSAGES.EVENT_SCHEDULE_LOCKED,
      });
    }
    this.assertDateInRange(date, now);
    if (dto.galleryWindowDays !== undefined) {
      // The options of the event's own plan version, not the newest one.
      const plan = await this.eventPlanService.planFor(event.planId);
      this.eventPlanService.resolveGalleryWindow(plan, dto.galleryWindowDays);
    }

    return { date, galleryWindowDays, ...gallerySchedule(date, galleryWindowDays, now) };
  }

  /** Any past date is allowed; a future one at most EVENT_DATE_MAX_MONTHS_AHEAD months away. */
  private assertDateInRange(date: Date, now: Date): void {
    if (date.getTime() <= latestEventDate(now).getTime()) return;
    throw new BadRequestException(EVENT_SERVICE_ERRORS.DATE_TOO_FAR_AHEAD(EVENT_DATE_MAX_MONTHS_AHEAD));
  }

  /**
   * Closes the event's gallery now, for an organizer who is done early or
   * needs the place for a new event (docs/event-quotas.md). From this moment
   * it is closed like any other: no uploads, joins or invite links, its photos
   * hidden, and it no longer counts as active. The close job removes the
   * photos within the hour, keeping those with open reports. It can't be
   * undone.
   *
   * Deactivating an event that has already closed changes nothing, so a
   * retried request succeeds and a gallery that closed on schedule is never
   * recorded as deactivated.
   */
  async deactivate(eventId: string, callerId: string): Promise<Event> {
    await this.getUpdatable(eventId, callerId);

    const now = new Date();
    // Conditional, so of two organizers deactivating at once one is recorded.
    const { count } = await this.prisma.event.updateMany({
      where: { id: eventId, ...galleryNotClosed(now) },
      data: { galleryClosesAt: now, deactivatedAt: now, deactivatedById: callerId },
    });
    if (count > 0) {
      this.logger.info({ event: "event.deactivated", eventId, callerId, audit: true }, "Event deactivated");
    }

    return this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  }

  async regenerateInvitationUrl(eventId: string, callerId: string): Promise<Event> {
    return this.regenerateInvite(eventId, callerId, AccessLevel.PARTICIPANT);
  }

  /**
   * Rotates the invite token for one access level. Other roles' links stay
   * valid. The PARTICIPANT token also updates Event.invitationUrl so older
   * clients that only know that field keep working.
   */
  async regenerateInvite(eventId: string, callerId: string, accessLevel: EventInviteAccessLevel): Promise<Event> {
    const event = await this.getUpdatable(eventId, callerId);
    // No new links into a closed event, which can't be joined.
    this.eventPlanService.assertGalleryNotClosed(event);

    const invite = await this.prisma.eventInvite.findUnique({
      where: { eventId_accessLevel: { eventId, accessLevel } },
    });
    if (!invite) throw new NotFoundException(EVENT_SERVICE_ERRORS.INVITE_NOT_FOUND(eventId, accessLevel));

    const token = randomUUID();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.eventInvite.update({
        where: { id: invite.id },
        data: { token },
      });

      if (accessLevel === AccessLevel.PARTICIPANT) {
        return tx.event.update({
          where: { id: eventId },
          data: { invitationUrl: token },
        });
      }

      return tx.event.findUniqueOrThrow({ where: { id: eventId } });
    });

    this.logger.info(
      { event: "event.invite.regenerated", eventId, callerId, accessLevel, audit: true },
      "Event invitation regenerated",
    );

    return updated;
  }

  /**
   * Invite rows for organizers only. Non-organizers get an empty list so
   * invite tokens are not leaked on event responses. A closed event has no
   * invites to share, since it can't be joined.
   */
  async listInvitesForCaller(eventId: string, callerId: string): Promise<EventInvite[]> {
    const access = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: callerId, eventId } },
      include: { event: { select: { galleryOpensAt: true, galleryClosesAt: true, galleryClosedAt: true } } },
    });
    if (!access || access.accessLevel !== AccessLevel.ORGANIZER) return [];
    if (galleryStateOf(access.event) === GALLERY_STATES.CLOSED) return [];

    return this.prisma.eventInvite.findMany({ where: { eventId, accessLevel: { in: EVENT_INVITE_ACCESS_LEVELS } } });
  }

  /**
   * Leaving records no ban, so the member can rejoin through the link while
   * the gallery is open. With DELETE their photos in the event go too; with
   * KEEP they stay in the gallery until it closes. On a closed event `photos`
   * is ignored: its gallery is gone, and what the close job kept (photos with
   * open reports) is evidence a member must not be able to delete.
   */
  async leaveEvent(eventId: string, callerId: string, photos: MemberPhotos = MEMBER_PHOTOS.KEEP): Promise<void> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const callerAccess = loaded.eventAccesses[0];
    if (!callerAccess) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, callerId));
    }

    if (callerAccess.accessLevel === AccessLevel.ORGANIZER) {
      const organizerCount = await this.countOrganizers(eventId);
      if (organizerCount <= 1) {
        throw new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId));
      }
    }

    const deletesPhotos = photos === MEMBER_PHOTOS.DELETE && galleryStateOf(loaded) !== GALLERY_STATES.CLOSED;

    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.eventAccess.delete({ where: { userId_eventId: { userId: callerId, eventId } } });
      return deletesPhotos ? deleteUploadsInTransaction(tx, { eventId, userId: callerId, closedById: callerId }) : null;
    });

    this.logger.info(
      {
        event: "event.left",
        eventId,
        callerId,
        photos,
        photosDeleted: deleted?.photosDeleted ?? 0,
        bytesFreed: (deleted?.bytesFreed ?? 0n).toString(),
        audit: true,
      },
      "User left event",
    );

    if (deleted) {
      await this.photoPurgeService.purgeObjects(deleted.photoKeys, {
        event: ALERT_EVENTS.EVENT_MEMBER_PHOTOS_PURGED,
        eventId,
        callerId,
      });
    }
  }

  async getEventParticipants(eventId: string, callerId: string): Promise<EventParticipant[]> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    const accesses = await this.prisma.eventAccess.findMany({
      where: { eventId },
      include: eventAccessWithUserInclude(callerId),
      orderBy: { createdAt: "asc" },
    });

    // Members who have not onboarded have no profile to show. The avatar key
    // arrives with the details row, so the listing stays at one query;
    // presigning each URL is local signing work, not a network call.
    return Promise.all(
      accesses.filter((access) => access.user.details).map((access) => this.toEventParticipant(eventId, access)),
    );
  }

  async updateUserAccessLevel(
    eventId: string,
    callerId: string,
    targetUserId: string,
    accessLevel: AccessLevel,
  ): Promise<EventParticipant> {
    await this.getUpdatable(eventId, callerId);

    if (callerId === targetUserId) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_MODIFY_OWN_ACCESS);
    }

    const targetAccess = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: targetUserId, eventId } },
      include: eventAccessWithUserInclude(callerId),
    });
    if (!targetAccess) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId));
    }

    if (targetAccess.accessLevel === AccessLevel.ORGANIZER && accessLevel !== AccessLevel.ORGANIZER) {
      const organizerCount = await this.countOrganizers(eventId);
      if (organizerCount <= 1) {
        throw new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId));
      }
    }

    if (targetAccess.accessLevel === accessLevel) {
      return this.toEventParticipant(eventId, targetAccess);
    }

    const updated = await this.prisma.eventAccess.update({
      where: { userId_eventId: { userId: targetUserId, eventId } },
      data: { accessLevel },
      include: eventAccessWithUserInclude(callerId),
    });

    this.logger.info(
      {
        event: "event.access_level.updated",
        eventId,
        callerId,
        targetUserId,
        accessLevel,
        audit: true,
      },
      "Event member access level updated",
    );

    return this.toEventParticipant(eventId, updated);
  }

  /**
   * Removing a member bans them from rejoining through the invitation link
   * until an organizer lifts it. With DELETE their photos in the event go too;
   * rows in the transaction, objects after it.
   */
  async removeUserFromEvent(
    eventId: string,
    callerId: string,
    targetUserId: string,
    photos: MemberPhotos = MEMBER_PHOTOS.KEEP,
  ): Promise<void> {
    await this.getUpdatable(eventId, callerId);

    if (callerId === targetUserId) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_REMOVE_SELF);
    }

    const targetAccess = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: targetUserId, eventId } },
    });
    if (!targetAccess) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId));
    }

    if (targetAccess.accessLevel === AccessLevel.ORGANIZER) {
      const organizerCount = await this.countOrganizers(eventId);
      if (organizerCount <= 1) {
        throw new UnprocessableEntityException(EVENT_SERVICE_ERRORS.LAST_ORGANIZER(eventId));
      }
    }

    const removed = await this.prisma.$transaction((tx) =>
      removeMemberInTransaction(tx, { eventId, userId: targetUserId, removedById: callerId, photos }),
    );

    this.logger.info(
      {
        event: "event.member.removed",
        eventId,
        callerId,
        targetUserId,
        photos,
        photosDeleted: removed.photosDeleted,
        reportsClosed: removed.reportsClosed,
        banned: true,
        audit: true,
      },
      "Event member removed",
    );

    await this.photoPurgeService.purgeObjects(removed.photoKeys, {
      event: ALERT_EVENTS.EVENT_MEMBER_PHOTOS_PURGED,
      eventId,
      callerId,
      targetUserId,
    });
  }

  /** Organizers only, newest first. */
  async listBans(eventId: string, callerId: string): Promise<EventBanWithUser[]> {
    await this.getUpdatable(eventId, callerId);

    return this.prisma.eventBan.findMany({
      where: { eventId },
      include: eventBanWithUserInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Organizers only. Idempotent: lifting a ban that does not exist is the
   * outcome asked for. The person is not re-added; they can rejoin through
   * the link.
   */
  async liftBan(eventId: string, callerId: string, userId: string): Promise<void> {
    await this.getUpdatable(eventId, callerId);

    const { count } = await this.prisma.eventBan.deleteMany({ where: { eventId, userId } });
    if (count > 0) {
      this.logger.info({ event: "event.ban.lifted", eventId, callerId, userId, audit: true }, "Event ban lifted");
    }
  }

  async delete(eventId: string, callerId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.DELETE, subject(EVENT_SUBJECT, event))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId));
    }

    // Only a closed event can be deleted, the way WhatsApp has you exit a group
    // before deleting it: deactivating comes first, so a delete never takes a
    // gallery people are still using (docs/event-quotas.md).
    if (galleryStateOf(event) !== GALLERY_STATES.CLOSED) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_CODES.EVENT_STILL_ACTIVE,
        message: PLAN_LIMIT_MESSAGES.EVENT_STILL_ACTIVE,
      });
    }

    // Collect the photo keys in the same transaction as the delete: the cascade
    // removes every Photo row of the event, so afterwards nothing remembers
    // which objects belonged to it. Rows go first on purpose. Once they are
    // gone no member can see a photo whose object is missing and the
    // uploaders' quota is already released; the objects are then purged
    // best effort after the commit, never inside a database transaction.
    //
    // The cover key comes from the row the delete itself returns, not from the
    // read above, so a cover confirmed in between is still purged.
    const { photoKeys, coverKey } = await this.prisma.$transaction(async (tx) => {
      const photos = await tx.photo.findMany({ where: { eventId }, select: { s3Key: true } });
      const deleted = await tx.event.delete({ where: { id: eventId } });
      return { photoKeys: photos.map((photo) => photo.s3Key), coverKey: deleted.coverS3Key };
    });

    this.logger.info(
      { event: "event.deleted", eventId, callerId, photoCount: photoKeys.length, audit: true },
      "Event deleted",
    );

    await this.photoPurgeService.purgeObjects(coverKey ? [...photoKeys, coverKey] : photoKeys, {
      event: ALERT_EVENTS.EVENT_PHOTOS_PURGED,
      eventId,
      callerId,
    });
  }

  private async countOrganizers(eventId: string): Promise<number> {
    return this.prisma.eventAccess.count({
      where: { eventId, accessLevel: AccessLevel.ORGANIZER },
    });
  }

  private async toEventParticipant(eventId: string, access: EventAccessWithUser): Promise<EventParticipant> {
    if (!access.user.details) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, access.userId));
    }

    return {
      userId: access.userId,
      username: access.user.details.username,
      name: access.user.details.name,
      accessLevel: access.accessLevel,
      avatarUrl: await this.imageUploads.getDownloadUrl(access.user.details.avatarS3Key),
      isBlockedByCaller: access.user.blocksReceived.length > 0,
    };
  }
}
