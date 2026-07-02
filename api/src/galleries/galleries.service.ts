import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Gallery, Prisma } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { EVENT_ACTIONS, EVENT_SUBJECT } from "src/events/events.abilities";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { GALLERY_ACTIONS, GALLERY_SUBJECT } from "./galleries.abilities";
import { GALLERY_SERVICE_ERRORS } from "./galleries.constants";

@Injectable()
export class GalleriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async findAllForEvent(eventId: string, callerId: string): Promise<Gallery[]> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { eventAccesses: { where: { userId: callerId } } },
    });
    if (!event) throw new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(EVENT_ACTIONS.READ, subject(EVENT_SUBJECT, event))) {
      throw new ForbiddenException(EVENT_SERVICE_ERRORS.READ_FORBIDDEN(eventId));
    }

    return this.prisma.gallery.findMany({
      where: {
        AND: [
          { eventId },
          accessibleBy(ability, GALLERY_ACTIONS.READ).ofType(GALLERY_SUBJECT) as Prisma.GalleryWhereInput,
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(galleryId: string, callerId: string): Promise<Gallery> {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { event: { include: { eventAccesses: { where: { userId: callerId } } } } },
    });
    if (!gallery) throw new NotFoundException(GALLERY_SERVICE_ERRORS.NOT_FOUND(galleryId));

    const ability = await this.abilityFactory.createForCaller(callerId);
    if (!ability.can(GALLERY_ACTIONS.READ, subject(GALLERY_SUBJECT, gallery))) {
      throw new ForbiddenException(GALLERY_SERVICE_ERRORS.READ_FORBIDDEN(galleryId));
    }

    const { event, ...rest } = gallery;
    void event;
    return rest;
  }
}
