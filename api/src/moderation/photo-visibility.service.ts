import { Injectable } from "@nestjs/common";
import { AccessLevel, Prisma, ReportStatus } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { reportHideThreshold } from "./moderation.constants";
import { EventForPhotoVisibility } from "./moderation.types";

/**
 * The single definition of "which photos of this event may this caller see"
 * on top of membership (CASL) and `READY` status, which the photo read paths
 * already enforce. Every read of a photo goes through `whereVisibleTo`, so the
 * list and the single read cannot drift apart. See docs/moderation.md.
 */
@Injectable()
export class PhotoVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A `Photo` filter to AND into a query scoped to `event`. Organizers get an
   * empty filter: they moderate, so they see everything. Everyone else loses
   *
   * 1. photos they have an OPEN report on,
   * 2. photos whose OPEN reports reached the event's hide threshold,
   * 3. photos of anyone they blocked or who blocked them.
   *
   * Costs one grouped query per call, never one per photo; 1 and 3 are
   * subqueries inside the photo query itself.
   */
  async whereVisibleTo(callerId: string, event: EventForPhotoVisibility): Promise<Prisma.PhotoWhereInput> {
    if (event.eventAccesses.some((access) => access.accessLevel === AccessLevel.ORGANIZER)) return {};

    const overThreshold = await this.prisma.report.groupBy({
      by: ["photoId"],
      where: { eventId: event.id, status: ReportStatus.OPEN, photoId: { not: null } },
      having: { photoId: { _count: { gte: reportHideThreshold(event._count.eventAccesses) } } },
    });
    const hiddenPhotoIds = overThreshold.flatMap(({ photoId }) => (photoId ? [photoId] : []));

    return {
      AND: [
        { reports: { none: { reporterId: callerId, status: ReportStatus.OPEN } } },
        { id: { notIn: hiddenPhotoIds } },
        {
          // A photo whose uploader is gone (addedById null) matches no block.
          NOT: {
            addedBy: {
              is: {
                OR: [
                  { blocksReceived: { some: { blockerId: callerId } } },
                  { blocksInitiated: { some: { blockedId: callerId } } },
                ],
              },
            },
          },
        },
      ],
    };
  }

  /** Whether one photo of `event` passes `whereVisibleTo` for the caller. */
  async isVisibleTo(photoId: string, callerId: string, event: EventForPhotoVisibility): Promise<boolean> {
    const visible = await this.prisma.photo.count({
      where: { AND: [{ id: photoId }, await this.whereVisibleTo(callerId, event)] },
    });

    return visible > 0;
  }
}
