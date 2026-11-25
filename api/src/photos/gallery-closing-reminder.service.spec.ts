import { NotificationType } from "generated/prisma/client";
import { NotificationsService } from "src/notifications/notifications.service";
import { PrismaService } from "src/prisma/prisma.service";
import { GalleryClosingReminderService } from "./gallery-closing-reminder.service";

describe("GalleryClosingReminderService", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const event1d = { id: "e-1d", galleryWindowDays: 7 };
  const event7d = { id: "e-7d", galleryWindowDays: 14 };
  const shortIn7d = { id: "e-short", galleryWindowDays: 7 };

  let prisma: {
    event: { findMany: jest.Mock };
    eventAccess: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { notify: jest.Mock; kick: jest.Mock };
  let service: GalleryClosingReminderService;

  beforeEach(() => {
    prisma = {
      event: { findMany: jest.fn() },
      eventAccess: { findMany: jest.fn().mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<number>) => fn({})),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue(2),
      kick: jest.fn(),
    };
    service = new GalleryClosingReminderService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it("notifies members for the 1-day window and the 7-day window on long rolls", async () => {
    prisma.event.findMany.mockResolvedValueOnce([event1d, event7d]).mockResolvedValueOnce([event7d, shortIn7d]);

    const result = await service.remindClosingGalleries(now);

    expect(result).toEqual({ reminded1d: 4, reminded7d: 2, events1d: 2, events7d: 1 });
    expect(notifications.notify).toHaveBeenCalledTimes(3);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.anything(),
      NotificationType.GALLERY_CLOSING,
      ["u1", "u2"],
      { eventId: "e-1d", window: "1d" },
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.anything(),
      NotificationType.GALLERY_CLOSING,
      ["u1", "u2"],
      { eventId: "e-7d", window: "7d" },
    );
    expect(notifications.kick).toHaveBeenCalledTimes(1);
  });

  it("skips kick when every notify is a dedupe no-op", async () => {
    prisma.event.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    notifications.notify.mockResolvedValue(0);

    const result = await service.remindClosingGalleries(now);

    expect(result).toEqual({ reminded1d: 0, reminded7d: 0, events1d: 0, events7d: 0 });
    expect(notifications.kick).not.toHaveBeenCalled();
  });

  it("queries open galleries with photos inside each window", async () => {
    prisma.event.findMany.mockResolvedValue([]);

    await service.remindClosingGalleries(now);

    const oneDayUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const sevenDayUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        galleryClosedAt: null,
        deactivatedAt: null,
        suspendedAt: null,
        underReviewAt: null,
        galleryClosesAt: { gt: now, lte: oneDayUntil },
        photos: { some: {} },
      },
      select: { id: true, galleryWindowDays: true },
    });
    expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        galleryClosedAt: null,
        deactivatedAt: null,
        suspendedAt: null,
        underReviewAt: null,
        galleryClosesAt: { gt: now, lte: sevenDayUntil },
        photos: { some: {} },
      },
      select: { id: true, galleryWindowDays: true },
    });
  });
});
