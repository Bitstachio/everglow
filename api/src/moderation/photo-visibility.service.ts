import { Injectable } from "@nestjs/common";
import { AccessLevel, Prisma, ReportStatus } from "generated/prisma/client";
import { GALLERY_STATES, galleryStateOf } from "src/plans/plans.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { PLATFORM_ONLY_REPORT_REASONS, SEVERE_REPORT_REASONS, reportHideThreshold } from "./moderation.constants";
import { EventForPhotoVisibility } from "./moderation.types";

/** Matches no photo: Prisma compiles an empty `in` to a false condition. */
const NO_PHOTOS: Prisma.PhotoWhereInput = { id: { in: [] } };

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
   * A `Photo` filter to AND into a query scoped to `event`. Once the event's
   * gallery has closed, nobody sees its photos, organizers included: the close
   * job removes them, and the ones it keeps for open reports are kept for the
   * platform, not the event (docs/event-quotas.md). While it is open,
   * organizers see everything but photos with an OPEN child-safety or
   * intimate-image report, which only the platform looks at. Everyone else
   * loses
   *
   * 1. photos they have an OPEN report on,
   * 2. photos with an OPEN report for a severe reason (nudity, violence),
   * 3. photos whose OPEN reports reached the event's hide threshold,
   * 4. photos of anyone they blocked or who blocked them.
   *
   * Costs one grouped query per call, never one per photo; 1, 2 and 4 are
   * subqueries inside the photo query itself.
   */
  async whereVisibleTo(callerId: string, event: EventForPhotoVisibility): Promise<Prisma.PhotoWhereInput> {
    if (galleryStateOf(event) === GALLERY_STATES.CLOSED) return NO_PHOTOS;
    if (event.eventAccesses.some((access) => access.accessLevel === AccessLevel.ORGANIZER)) {
      return { reports: { none: { status: ReportStatus.OPEN, reason: { in: [...PLATFORM_ONLY_REPORT_REASONS] } } } };
    }

    const overThreshold = await this.prisma.report.groupBy({
      by: ["photoId"],
      where: { eventId: event.id, status: ReportStatus.OPEN, photoId: { not: null } },
      having: { photoId: { _count: { gte: reportHideThreshold(event._count.eventAccesses) } } },
    });
    const hiddenPhotoIds = overThreshold.flatMap(({ photoId }) => (photoId ? [photoId] : []));

    return {
      AND: [
        { reports: { none: { reporterId: callerId, status: ReportStatus.OPEN } } },
        { reports: { none: { status: ReportStatus.OPEN, reason: { in: [...SEVERE_REPORT_REASONS] } } } },
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
