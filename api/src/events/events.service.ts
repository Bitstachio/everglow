import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { AccessLevel, Event, Prisma } from "generated/prisma/client";
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
import { REMOVED_MEMBER_PHOTOS, RemovedMemberPhotos, removeMemberInTransaction } from "./event-membership";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import { EVENT_SERVICE_ERRORS, ORGANIZER_BLOCKED_BY_CALLER_CODE, REMOVED_FROM_EVENT_CODE } from "./events.constants";
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

    const invitationUrl = randomUUID();

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        date: new Date(dto.date),
        creatorId,
        invitationUrl,
        ...(dto.description !== undefined && { description: dto.description }),
        eventAccesses: {
          create: {
            userId: creatorId,
            accessLevel: AccessLevel.ORGANIZER,
          },
        },
      },
    });

    this.logger.info({ event: "event.created", eventId: event.id, creatorId }, "Event created");

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

    const event = await this.prisma.event.findUnique({ where: { invitationUrl } });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.INVITATION_NOT_FOUND(invitationUrl));

    const existing = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: callerId, eventId: event.id } },
    });
    if (existing) throw new ConflictException(EVENT_SERVICE_ERRORS.ALREADY_JOINED(event.id));

    // Removed by an organizer: said plainly, since they already know. Checked
    // before blocks so a removed member is not told about a block instead.
    const ban = await this.prisma.eventBan.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: callerId } },
    });
    if (ban) {
      throw new ForbiddenException({ code: REMOVED_FROM_EVENT_CODE, message: EVENT_SERVICE_ERRORS.REMOVED_FROM_EVENT });
    }

    await this.assertNoBlockWithOrganizers(event.id, invitationUrl, callerId);

    await this.prisma.eventAccess.create({
      data: {
        userId: callerId,
        eventId: event.id,
        accessLevel: AccessLevel.PARTICIPANT,
      },
    });

    this.logger.info(
      { event: "event.joined", eventId: event.id, callerId, accessLevel: AccessLevel.PARTICIPANT },
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
    await this.getUpdatable(eventId, callerId);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    this.logger.info({ event: "event.updated", eventId, callerId, fields: Object.keys(dto) }, "Event updated");

    return updated;
  }

  async regenerateInvitationUrl(eventId: string, callerId: string): Promise<Event> {
    await this.getUpdatable(eventId, callerId);

    const invitationUrl = randomUUID();
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { invitationUrl },
    });

    this.logger.info(
      { event: "event.invitation_url.regenerated", eventId, callerId, audit: true },
      "Event invitation URL regenerated",
    );

    return updated;
  }

  async leaveEvent(eventId: string, callerId: string): Promise<void> {
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

    await this.prisma.eventAccess.delete({
      where: { userId_eventId: { userId: callerId, eventId } },
    });

    this.logger.info({ event: "event.left", eventId, callerId, audit: true }, "User left event");
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
    photos: RemovedMemberPhotos = REMOVED_MEMBER_PHOTOS.KEEP,
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
