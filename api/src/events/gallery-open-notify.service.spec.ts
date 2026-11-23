import { NotificationType } from "generated/prisma/client";
import { NotificationsService } from "src/notifications/notifications.service";
import { PrismaService } from "src/prisma/prisma.service";
import { GalleryOpenNotifyService } from "./gallery-open-notify.service";

describe("GalleryOpenNotifyService", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const opensAt = new Date("2026-11-08T11:30:00.000Z");

  let prisma: {
    event: { findMany: jest.Mock };
    eventAccess: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { notify: jest.Mock; kick: jest.Mock };
  let service: GalleryOpenNotifyService;

  beforeEach(() => {
    prisma = {
      event: { findMany: jest.fn().mockResolvedValue([{ id: "e1", galleryOpensAt: opensAt }]) },
      eventAccess: { findMany: jest.fn().mockResolvedValue([{ userId: "u1" }]) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<number>) => fn({})),
    };
    notifications = { notify: jest.fn().mockResolvedValue(1), kick: jest.fn() };
    service = new GalleryOpenNotifyService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it("notifies members who joined at or before the open time", async () => {
    const result = await service.notifyOpenedGalleries(now);

    expect(result).toEqual({ notified: 1, events: 1 });
    expect(prisma.eventAccess.findMany).toHaveBeenCalledWith({
      where: { eventId: "e1", createdAt: { lte: opensAt } },
      select: { userId: true },
    });
    expect(notifications.notify).toHaveBeenCalledWith(expect.anything(), NotificationType.GALLERY_OPENED, ["u1"], {
      eventId: "e1",
    });
    expect(notifications.kick).toHaveBeenCalledTimes(1);
  });

  it("skips kick when nothing new is queued", async () => {
    prisma.event.findMany.mockResolvedValue([]);
    const result = await service.notifyOpenedGalleries(now);
    expect(result).toEqual({ notified: 0, events: 0 });
    expect(notifications.kick).not.toHaveBeenCalled();
  });
});
