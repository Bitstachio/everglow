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
import { AppAbility } from "src/casl/ability.types";
import { DEFAULT_GALLERY_NAME } from "src/galleries/galleries.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import { EVENT_SERVICE_ERRORS } from "./events.constants";
import { EventParticipant, eventAccessWithUserInclude, eventWithCallerAccessInclude } from "./events.types";

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
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
        galleries: {
          create: {
            name: DEFAULT_GALLERY_NAME,
          },
        },
      },
    });

    this.logger.info({ event: "event.created", eventId: event.id, creatorId }, "Event created");

    return event;
  }

  async findAllForUser(userId: string): Promise<Event[]> {
    const isOnboarded = await this.isUserOnboarded(userId);
    if (!isOnboarded) return [];

    const ability = this.abilityFactory.createForUser({ id: userId, isOnboarded });

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

  async findOne(eventId: string, callerId: string): Promise<Event> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    const { eventAccesses, ...event } = loaded;
    void eventAccesses;
    return event;
  }

  async update(eventId: string, callerId: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.UPDATE, subject(EVENT_SUBJECT, event))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));
    }

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
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.UPDATE, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));
    }

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

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    const accesses = await this.prisma.eventAccess.findMany({
      where: { eventId },
      include: eventAccessWithUserInclude,
      orderBy: { createdAt: "asc" },
    });

    return accesses
      .filter((access) => access.user.details)
      .map((access) => ({
        userId: access.userId,
        name: access.user.details!.name,
        accessLevel: access.accessLevel,
      }));
  }

  async updateUserAccessLevel(
    eventId: string,
    callerId: string,
    targetUserId: string,
    accessLevel: AccessLevel,
  ): Promise<EventParticipant> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.UPDATE, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));
    }

    if (callerId === targetUserId) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.CANNOT_MODIFY_OWN_ACCESS);
    }

    const targetAccess = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: targetUserId, eventId } },
      include: eventAccessWithUserInclude,
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
      include: eventAccessWithUserInclude,
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

  async removeUserFromEvent(eventId: string, callerId: string, targetUserId: string): Promise<void> {
    const loaded = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!loaded) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.UPDATE, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.UPDATE_FORBIDDEN(eventId));
    }

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

    await this.prisma.eventAccess.delete({
      where: { userId_eventId: { userId: targetUserId, eventId } },
    });

    this.logger.info(
      { event: "event.member.removed", eventId, callerId, targetUserId, audit: true },
      "Event member removed",
    );
  }

  async delete(eventId: string, callerId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.createAbilityForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.DELETE, subject(EVENT_SUBJECT, event))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId));
    }

    await this.prisma.event.delete({ where: { id: eventId } });

    this.logger.info({ event: "event.deleted", eventId, callerId, audit: true }, "Event deleted");
  }

  private async countOrganizers(eventId: string): Promise<number> {
    return this.prisma.eventAccess.count({
      where: { eventId, accessLevel: AccessLevel.ORGANIZER },
    });
  }

  private async createAbilityForCaller(callerId: string): Promise<AppAbility> {
    const isOnboarded = await this.isUserOnboarded(callerId);
    return this.abilityFactory.createForUser({ id: callerId, isOnboarded });
  }

  private toEventParticipant(
    eventId: string,
    access: {
      userId: string;
      accessLevel: AccessLevel;
      user: { details: { name: string } | null };
    },
  ): EventParticipant {
    if (!access.user.details) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, access.userId));
    }

    return {
      userId: access.userId,
      name: access.user.details.name,
      accessLevel: access.accessLevel,
    };
  }

  private async isUserOnboarded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithDetailsInclude,
    });

    return !!user?.details;
  }
}
