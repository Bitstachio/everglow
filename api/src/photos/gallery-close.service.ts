import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Event, Prisma, ReportStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { EventPlanService } from "src/plans/event-plan.service";
import { PrismaService } from "src/prisma/prisma.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { GALLERY_CLOSE_PHOTO_CHUNK_SIZE } from "./photos.constants";

/** What one run did. Bytes are a decimal string so the heartbeat stays JSON. */
export interface GalleryCloseResult {
  /** Galleries whose window had ended and that this run closed. */
  closed: number;
  /** Galleries closed earlier that still held photos no open report needs, emptied this run. */
  swept: number;
  photosRemoved: number;
  bytesRemoved: string;
  /** Photos left in the galleries closed this run because an OPEN report needs them. */
  photosKept: number;
  /** Galleries whose close or sweep threw; the next run retries each one. */
  failed: number;
}

interface RunTotals extends Omit<GalleryCloseResult, "bytesRemoved"> {
  bytesRemoved: bigint;
}

interface RemovedPhotos {
  photos: number;
  bytes: bigint;
}

type DueGallery = Pick<Event, "id" | "planId" | "galleryClosesAt">;

/**
 * The photos a closed gallery no longer holds: every one without an OPEN
 * report, in an event that isn't under review. A reported photo stays as
 * evidence until its reports are closed, and every photo of an event under
 * review stays until the platform lifts it (docs/moderation.md §7). The sweep
 * removes them after that.
 */
const REMOVABLE_PHOTOS: Prisma.PhotoWhereInput = {
  reports: { none: { status: ReportStatus.OPEN } },
  event: { underReviewAt: null },
};

/**
 * Closes galleries whose window has ended (docs/event-quotas.md): marks the
 * event closed and removes its photos. The event, its members and its cover
 * stay. Rows go first and objects after, as an event delete does; an object
 * that cannot be deleted is an orphan for the daily reconciler.
 *
 * Each run makes two passes, each over at most `photos.galleryCloseBatchSize`
 * galleries:
 *
 * 1. Close: claim each due gallery by setting `galleryClosedAt`, then remove
 *    its photos.
 * 2. Sweep: empty galleries closed earlier that still hold photos no OPEN
 *    report needs: their reports were resolved since, the event's review was
 *    lifted, an upload landed late, or a run stopped half way.
 *
 * Nothing is visible in the meantime: from the close time on, reads show a
 * closed gallery's photos to nobody (PhotoVisibilityService).
 */
@Injectable()
export class GalleryCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photoPurgeService: PhotoPurgeService,
    private readonly eventPlanService: EventPlanService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  async closeDueGalleries(now: Date = new Date()): Promise<GalleryCloseResult> {
    const batchSize = this.configService.getOrThrow<number>("photos.galleryCloseBatchSize");
    const run: RunTotals = { closed: 0, swept: 0, photosRemoved: 0, bytesRemoved: 0n, photosKept: 0, failed: 0 };

    const due = await this.prisma.event.findMany({
      where: { galleryClosedAt: null, galleryClosesAt: { lte: now } },
      orderBy: { galleryClosesAt: "asc" },
      take: batchSize,
      select: { id: true, planId: true, galleryClosesAt: true },
    });
    for (const gallery of due) {
      await this.isolate(gallery.id, run, async () => {
        const closed = await this.closeGallery(gallery, now);
        if (!closed) return;
        run.closed += 1;
        run.photosRemoved += closed.removed.photos;
        run.bytesRemoved += closed.removed.bytes;
        run.photosKept += closed.kept;
      });
    }

    const leftovers = await this.prisma.event.findMany({
      where: { galleryClosedAt: { not: null }, underReviewAt: null, photos: { some: REMOVABLE_PHOTOS } },
      take: batchSize,
      select: { id: true },
    });
    for (const { id } of leftovers) {
      await this.isolate(id, run, async () => {
        const removed = await this.removePhotos(id);
        this.logger.info(
          {
            event: "event.gallery.swept",
            eventId: id,
            photosRemoved: removed.photos,
            bytesRemoved: removed.bytes.toString(),
            audit: true,
          },
          "Removed photos a closed gallery no longer keeps",
        );
        run.swept += 1;
        run.photosRemoved += removed.photos;
        run.bytesRemoved += removed.bytes;
      });
    }

    return { ...run, bytesRemoved: run.bytesRemoved.toString() };
  }

  /**
   * Claims a due gallery and empties it. The claim is conditional, so a close
   * time moved later since the gallery was picked, or another instance closing
   * it first, leaves it alone (null).
   */
  private async closeGallery(gallery: DueGallery, now: Date): Promise<{ removed: RemovedPhotos; kept: number } | null> {
    const claim = await this.prisma.event.updateMany({
      where: { id: gallery.id, galleryClosedAt: null, galleryClosesAt: { lte: now } },
      data: { galleryClosedAt: now },
    });
    if (claim.count === 0) return null;

    // What the gallery held when it closed, measured before anything goes:
    // the usage the paid plans' prices are set from (docs/event-quotas.md).
    const [members, held, plan] = await Promise.all([
      this.prisma.eventAccess.count({ where: { eventId: gallery.id } }),
      this.prisma.photo.aggregate({
        where: { eventId: gallery.id },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.eventPlanService.planFor(gallery.planId),
    ]);
    const removed = await this.removePhotos(gallery.id);
    const kept = await this.prisma.photo.count({ where: { eventId: gallery.id } });

    this.logger.info(
      {
        event: "event.gallery.closed",
        eventId: gallery.id,
        plan: plan.code,
        planVersion: plan.version,
        galleryClosesAt: gallery.galleryClosesAt,
        members,
        photos: held._count._all,
        bytes: BigInt(held._sum.sizeBytes ?? 0).toString(),
        photosRemoved: removed.photos,
        photosKept: kept,
        audit: true,
      },
      "Gallery closed",
    );
    return { removed, kept };
  }

  /**
   * Removes the gallery's photos that no OPEN report needs, a chunk at a time:
   * the rows, then their objects. Small chunks keep every statement short, and
   * a run that stops half way leaves the rest to the next sweep.
   */
  private async removePhotos(eventId: string): Promise<RemovedPhotos> {
    const removed: RemovedPhotos = { photos: 0, bytes: 0n };
    for (;;) {
      const chunk = await this.prisma.photo.findMany({
        where: { eventId, ...REMOVABLE_PHOTOS },
        take: GALLERY_CLOSE_PHOTO_CHUNK_SIZE,
        select: { id: true, s3Key: true, sizeBytes: true },
      });
      if (chunk.length === 0) return removed;

      await this.prisma.photo.deleteMany({ where: { id: { in: chunk.map((photo) => photo.id) } } });
      await this.photoPurgeService.purgeObjects(
        chunk.map((photo) => photo.s3Key),
        { event: ALERT_EVENTS.GALLERY_PHOTOS_PURGED, eventId },
      );
      removed.photos += chunk.length;
      removed.bytes += chunk.reduce((sum, photo) => sum + BigInt(photo.sizeBytes), 0n);

      if (chunk.length < GALLERY_CLOSE_PHOTO_CHUNK_SIZE) return removed;
    }
  }

  /** Runs one gallery's work. A failure is logged and counted, and the run moves on. */
  private async isolate(eventId: string, run: RunTotals, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      run.failed += 1;
      this.logger.error(
        { err: error as Error, event: ALERT_EVENTS.GALLERY_CLOSE_FAILED, eventId },
        "Gallery close failed; the next run retries it",
      );
    }
  }
}
