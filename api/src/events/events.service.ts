import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { AccessLevel, Event } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import { userWithDetailsInclude } from "src/users/users.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { EVENT_SERVICE_ERRORS } from "./events.constants";
import { UpdateEventDto } from "./dto/update-event.dto";

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
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

  async findAllByCreatorId(userId: string): Promise<Event[]> {
    if (!(await this.isUserOnboarded(userId))) return [];

    return this.prisma.event.findMany({
      where: { creatorId: userId },
      orderBy: { date: "asc" },
    });
  }

  async findAllForUser(userId: string): Promise<Event[]> {
    if (!(await this.isUserOnboarded(userId))) return [];

    return this.prisma.event.findMany({
      where: {
        OR: [{ creatorId: userId }, { eventAccesses: { some: { userId } } }],
      },
      orderBy: { date: "asc" },
    });
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    throw new NotImplementedException();
  }

  async delete(eventId: string, callerId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const access = await this.prisma.eventAccess.findUnique({
      where: { userId_eventId: { userId: callerId, eventId } },
    });

    if (!access || access.accessLevel !== AccessLevel.ORGANIZER) {
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
