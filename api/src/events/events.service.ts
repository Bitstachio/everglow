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
import { AccessLevel, Event } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "./events.abilities";
import { EVENT_SERVICE_ERRORS } from "./events.constants";
import { eventWithCallerAccessInclude } from "./events.types";

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

    const ability = this.abilityFactory.createForUser({ id: creatorId, isOnboarded: true });
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

  async findAllByCreatorId(creatorId: string): Promise<Event[]> {
    if (!(await this.isUserOnboarded(creatorId))) return [];

    const ability = this.abilityFactory.createForUser({ id: creatorId, isOnboarded: true });

    return this.prisma.event.findMany({
      where: {
        AND: [accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT), { creatorId: creatorId }],
      },
      orderBy: { date: "asc" },
    });
  }

  async findAllForUser(userId: string): Promise<Event[]> {
    if (!(await this.isUserOnboarded(userId))) return [];

    const ability = this.abilityFactory.createForUser({ id: userId, isOnboarded: true });

    return this.prisma.event.findMany({
      where: accessibleBy(ability, EVENT_ACTIONS.READ).ofType(EVENT_SUBJECT),
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

    const ability = this.abilityFactory.createForUser({ id: callerId, isOnboarded: true });
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, loaded))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    const { eventAccesses: _, ...event } = loaded;
    return event;
  }

  async update(eventId: string, callerId: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = this.abilityFactory.createForUser({ id: callerId, isOnboarded: true });
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

  async delete(eventId: string, callerId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventWithCallerAccessInclude(callerId),
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = this.abilityFactory.createForUser({ id: callerId, isOnboarded: true });
    if (!ability.can(EVENT_ACTIONS.DELETE, subject(EVENT_SUBJECT, event))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.DELETE_FORBIDDEN(eventId));
    }

    await this.prisma.event.delete({ where: { id: eventId } });

    this.logger.info({ event: "event.deleted", eventId, callerId, audit: true }, "Event deleted");
  }

  private async isUserOnboarded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithDetailsInclude,
    });

    return !!user?.details;
  }
}
