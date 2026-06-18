import { Injectable, NotFoundException, NotImplementedException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Event } from "generated/prisma/client";
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

  private async isUserOnboarded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithDetailsInclude,
    });

    return !!user?.details;
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    throw new NotImplementedException();
  }

  async delete(id: string): Promise<void> {
    throw new NotImplementedException();
  }
}
