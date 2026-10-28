import { Injectable } from "@nestjs/common";
import { AccessLevel, PhotoStatus, Prisma, ReportStatus } from "generated/prisma/client";
import { GALLERY_STATES, galleryStateOf } from "src/plans/plans.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { PLATFORM_ONLY_REPORT_REASONS, SEVERE_REPORT_REASONS, reportHideThreshold } from "./moderation.constants";
import { EventForPhotoVisibility, eventForPhotoVisibilityInclude } from "./moderation.types";

/** Matches no photo: Prisma compiles an empty `in` to a false condition. */
const NO_PHOTOS: Prisma.PhotoWhereInput = { id: { in: [] } };

/** Organizers see every photo but those only the platform may look at. */
const ORGANIZER_FILTER: Prisma.PhotoWhereInput = {
  reports: { none: { status: ReportStatus.OPEN, reason: { in: [...PLATFORM_ONLY_REPORT_REASONS] } } },
};

const showsPhotos = (event: EventForPhotoVisibility): boolean =>
  galleryStateOf(event) !== GALLERY_STATES.CLOSED && !event.suspendedAt;

const isOrganizer = (event: EventForPhotoVisibility): boolean =>
  event.eventAccesses.some((access) => access.accessLevel === AccessLevel.ORGANIZER);

/** Rules 1–4 of `whereVisibleTo`, for a caller who is not an organizer of the event. */
const memberFilter = (callerId: string, hiddenPhotoIds: string[]): Prisma.PhotoWhereInput => ({
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
});

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
    // A closed gallery, or a suspended event, shows nothing to anyone.
    if (!showsPhotos(event)) return NO_PHOTOS;
    if (isOrganizer(event)) return ORGANIZER_FILTER;
    return memberFilter(callerId, await this.hiddenPhotoIds([event]));
  }

  /**
   * How many photos of each event the caller sees: the count of what
   * `whereVisibleTo` lets through, so it always matches the gallery. Events
   * the caller can't see photos of count 0. A fixed number of queries
   * whatever the number of events, for lists like Home.
   */
  async countVisibleTo(callerId: string, eventIds: string[]): Promise<Map<string, number>> {
    const counts = new Map(eventIds.map((id) => [id, 0]));
    if (eventIds.length === 0) return counts;

    const events = (
      await this.prisma.event.findMany({
        where: { id: { in: eventIds } },
        include: eventForPhotoVisibilityInclude(callerId),
      })
    ).filter(showsPhotos);
    const hosted = events.filter(isOrganizer);
    const others = events.filter((event) => !isOrganizer(event));
    const hidden = await this.hiddenPhotoIds(others);

    const groups = await Promise.all([
      this.countByEvent(hosted, ORGANIZER_FILTER),
      this.countByEvent(others, memberFilter(callerId, hidden)),
    ]);
    for (const row of groups.flat()) counts.set(row.eventId, row._count._all);
    return counts;
  }

  /** How many photos of `eventId` the caller sees from each uploader, keyed by user id. */
  async countVisibleByUploader(callerId: string, eventId: string): Promise<Map<string, number>> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventForPhotoVisibilityInclude(callerId),
    });
    if (!event) return new Map();

    const rows = await this.prisma.photo.groupBy({
      by: ["addedById"],
      where: { AND: [{ eventId, status: PhotoStatus.READY }, await this.whereVisibleTo(callerId, event)] },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((row) => (row.addedById ? [[row.addedById, row._count._all] as const] : [])));
  }

  /**
   * Photos whose OPEN reports reached their event's hide threshold, which
   * depends on that event's member count. One grouped query for any number of
   * events.
   */
  private async hiddenPhotoIds(events: EventForPhotoVisibility[]): Promise<string[]> {
    if (events.length === 0) return [];
    const thresholds = new Map(events.map((event) => [event.id, reportHideThreshold(event._count.eventAccesses)]));

    // The database drops what is under every event's threshold; each event's own is checked below.
    const reported = await this.prisma.report.groupBy({
      by: ["eventId", "photoId"],
      where: { eventId: { in: [...thresholds.keys()] }, status: ReportStatus.OPEN, photoId: { not: null } },
      having: { photoId: { _count: { gte: Math.min(...thresholds.values()) } } },
      _count: { _all: true },
    });
    return reported.flatMap(({ eventId, photoId, _count }) =>
      photoId && eventId && _count._all >= thresholds.get(eventId)! ? [photoId] : [],
    );
  }

  private async countByEvent(events: EventForPhotoVisibility[], filter: Prisma.PhotoWhereInput) {
    if (events.length === 0) return [];
    return this.prisma.photo.groupBy({
      by: ["eventId"],
      where: { AND: [{ eventId: { in: events.map((event) => event.id) }, status: PhotoStatus.READY }, filter] },
      _count: { _all: true },
    });
  }

  /** Whether one photo of `event` passes `whereVisibleTo` for the caller. */
  async isVisibleTo(photoId: string, callerId: string, event: EventForPhotoVisibility): Promise<boolean> {
    const visible = await this.prisma.photo.count({
      where: { AND: [{ id: photoId }, await this.whereVisibleTo(callerId, event)] },
    });

    return visible > 0;
  }
}
