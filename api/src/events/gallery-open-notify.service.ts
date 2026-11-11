import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "generated/prisma/client";
import { NotificationsService } from "src/notifications/notifications.service";
import { PrismaService } from "src/prisma/prisma.service";

/** What one open-notify pass queued. */
export interface GalleryOpenNotifyResult {
  /** New `GALLERY_OPENED` outbox rows. */
  notified: number;
  /** Galleries whose open time fell in the lookback window. */
  events: number;
}

/** How far back a pass looks for galleries that just opened. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Queues the gallery-opened push from EV-141 / design 07.3: one notice per
 * member who was on the roll before `galleryOpensAt`. People who join after
 * it opens get none. Dedupe `gallery_opened:<eventId>:<userId>` makes reruns
 * and schedule moves while upcoming safe.
 */
@Injectable()
export class GalleryOpenNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyOpenedGalleries(now: Date = new Date()): Promise<GalleryOpenNotifyResult> {
    const since = new Date(now.getTime() - LOOKBACK_MS);
    const events = await this.prisma.event.findMany({
      where: {
        galleryOpensAt: { lte: now, gt: since },
        galleryClosedAt: null,
        deactivatedAt: null,
        suspendedAt: null,
        underReviewAt: null,
      },
      select: { id: true, galleryOpensAt: true },
    });

    let notified = 0;
    for (const event of events) {
      notified += await this.notifyMembers(event.id, event.galleryOpensAt);
    }

    if (notified > 0) this.notifications.kick();

    return { notified, events: events.length };
  }

  private async notifyMembers(eventId: string, galleryOpensAt: Date): Promise<number> {
    const members = await this.prisma.eventAccess.findMany({
      where: { eventId, createdAt: { lte: galleryOpensAt } },
      select: { userId: true },
    });
    if (members.length === 0) return 0;

    return this.prisma.$transaction((tx: Prisma.TransactionClient) =>
      this.notifications.notify(
        tx,
        NotificationType.GALLERY_OPENED,
        members.map((m) => m.userId),
        { eventId },
      ),
    );
  }
}
