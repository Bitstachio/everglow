import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "generated/prisma/client";
import { NotificationsService } from "src/notifications/notifications.service";
import { PrismaService } from "src/prisma/prisma.service";

/** What one reminder pass queued. Counts are new outbox rows, not events. */
export interface GalleryClosingReminderResult {
  /** New `GALLERY_CLOSING` rows for the 1-day window. */
  reminded1d: number;
  /** New `GALLERY_CLOSING` rows for the 7-day window (14+ day galleries only). */
  reminded7d: number;
  /** Galleries considered for the 1-day window. */
  events1d: number;
  /** Galleries considered for the 7-day window. */
  events7d: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Queues the closing reminders from docs/event-quotas.md and EV-72: every
 * member of a roll that still has photos gets one push a day before
 * `galleryClosesAt`, and another seven days before when the host picked a
 * 14-day or longer window. Dedupe keys make hourly reruns and date moves
 * safe; a deactivated gallery closes at once and is skipped.
 */
@Injectable()
export class GalleryClosingReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async remindClosingGalleries(now: Date = new Date()): Promise<GalleryClosingReminderResult> {
    const events1d = await this.findClosing(now, 1);
    const events7d = (await this.findClosing(now, 7)).filter(
      (event) => event.galleryWindowDays != null && event.galleryWindowDays >= 14,
    );

    let reminded1d = 0;
    let reminded7d = 0;

    for (const event of events1d) {
      reminded1d += await this.notifyMembers(event.id, "1d");
    }
    for (const event of events7d) {
      reminded7d += await this.notifyMembers(event.id, "7d");
    }

    if (reminded1d + reminded7d > 0) this.notifications.kick();

    return {
      reminded1d,
      reminded7d,
      events1d: events1d.length,
      events7d: events7d.length,
    };
  }

  private async findClosing(now: Date, days: number): Promise<Array<{ id: string; galleryWindowDays: number | null }>> {
    const until = new Date(now.getTime() + days * MS_PER_DAY);
    return this.prisma.event.findMany({
      where: {
        galleryClosedAt: null,
        deactivatedAt: null,
        suspendedAt: null,
        underReviewAt: null,
        galleryClosesAt: { gt: now, lte: until },
        photos: { some: {} },
      },
      select: { id: true, galleryWindowDays: true },
    });
  }

  private async notifyMembers(eventId: string, window: "1d" | "7d"): Promise<number> {
    const members = await this.prisma.eventAccess.findMany({
      where: { eventId },
      select: { userId: true },
    });
    if (members.length === 0) return 0;

    return this.prisma.$transaction((tx: Prisma.TransactionClient) =>
      this.notifications.notify(
        tx,
        NotificationType.GALLERY_CLOSING,
        members.map((m) => m.userId),
        { eventId, window },
      ),
    );
  }
}
