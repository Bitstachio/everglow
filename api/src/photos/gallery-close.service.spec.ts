import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Plan, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { EventPlanService } from "src/plans/event-plan.service";
import { PrismaService } from "src/prisma/prisma.service";
import { GalleryCloseService } from "./gallery-close.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { GALLERY_CLOSE_PHOTO_CHUNK_SIZE } from "./photos.constants";

// Prisma is mocked (docs/testing.md), so this spec pins the queries and their
// order, not the rows the compiled SQL returns.
describe("GalleryCloseService", () => {
  let service: GalleryCloseService;
  let prisma: DeepMockProxy<PrismaClient>;
  let purge: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock; warn: jest.Mock };

  const now = new Date("2026-11-01T12:00:00.000Z");
  const batchSize = 100;
  const freePlan: Plan = {
    id: "f0000000-0000-4000-8000-000000000001",
    code: "FREE",
    version: 1,
    memberLimit: 30,
    storageLimitBytes: 3n * 1024n ** 3n,
    galleryWindowDays: 30,
    galleryWindowOptions: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const due = (id: string) => ({ id, planId: freePlan.id, galleryClosesAt: new Date("2026-11-01T11:00:00.000Z") });
  const photo = (id: string, sizeBytes = 1000) => ({ id, s3Key: `photos/u/e/${id}`, sizeBytes });
  const removable = { reports: { none: { status: "OPEN" } } };

  /** The first findMany is the due galleries, the second the closed ones to sweep. */
  const mockPasses = (dueGalleries: ReturnType<typeof due>[], leftovers: { id: string }[] = []) =>
    prisma.event.findMany.mockResolvedValueOnce(dueGalleries as never).mockResolvedValueOnce(leftovers as never);

  /** What a gallery holds when it is measured before anything is removed. */
  const mockHeld = (photos: number, bytes: number) =>
    prisma.photo.aggregate.mockResolvedValue({ _count: { _all: photos }, _sum: { sizeBytes: bytes } } as never);

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventAccess.count.mockResolvedValue(12);
    prisma.photo.findMany.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
    prisma.photo.count.mockResolvedValue(0);
    mockHeld(0, 0);
    purge = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0 }) };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleryCloseService,
        EventPlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotoPurgeService, useValue: purge },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn(() => batchSize) } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(GalleryCloseService);
  });

  it("picks at most a batch of open galleries past their close time, the longest overdue first", async () => {
    await service.closeDueGalleries(now);

    expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
      where: { galleryClosedAt: null, galleryClosesAt: { lte: now } },
      orderBy: { galleryClosesAt: "asc" },
      take: batchSize,
      select: { id: true, planId: true, galleryClosesAt: true },
    });
  });

  it("does nothing on an idle run", async () => {
    await expect(service.closeDueGalleries(now)).resolves.toEqual({
      closed: 0,
      swept: 0,
      photosRemoved: 0,
      bytesRemoved: "0",
      photosKept: 0,
      failed: 0,
    });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(purge.purgeObjects).not.toHaveBeenCalled();
  });

  describe("closing a due gallery", () => {
    beforeEach(() => {
      mockPasses([due("event-1")]);
      mockHeld(3, 3000);
      prisma.photo.findMany.mockResolvedValueOnce([photo("p1"), photo("p2")] as never);
      prisma.photo.count.mockResolvedValue(1);
    });

    it("claims it only while it is still open and due", async () => {
      await service.closeDueGalleries(now);

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: "event-1", galleryClosedAt: null, galleryClosesAt: { lte: now } },
        data: { galleryClosedAt: now },
      });
    });

    it("removes every photo without an OPEN report, deleting the rows before purging their objects", async () => {
      await service.closeDueGalleries(now);

      expect(prisma.photo.findMany).toHaveBeenCalledWith({
        where: { eventId: "event-1", ...removable },
        take: GALLERY_CLOSE_PHOTO_CHUNK_SIZE,
        select: { id: true, s3Key: true, sizeBytes: true },
      });
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "p2"] } } });
      expect(purge.purgeObjects).toHaveBeenCalledWith(["photos/u/e/p1", "photos/u/e/p2"], {
        event: "event.gallery.photos_purged",
        eventId: "event-1",
      });
      expect(prisma.photo.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        purge.purgeObjects.mock.invocationCallOrder[0],
      );
    });

    it("logs what the gallery held when it closed, for pricing", async () => {
      await service.closeDueGalleries(now);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "event.gallery.closed",
          eventId: "event-1",
          plan: "FREE",
          planVersion: 1,
          members: 12,
          photos: 3,
          bytes: "3000",
          photosRemoved: 2,
          photosKept: 1,
          audit: true,
        }),
        expect.any(String),
      );
    });

    it("reports the run's totals", async () => {
      await expect(service.closeDueGalleries(now)).resolves.toEqual({
        closed: 1,
        swept: 0,
        photosRemoved: 2,
        bytesRemoved: "2000",
        photosKept: 1,
        failed: 0,
      });
    });
  });

  it("leaves a gallery alone when the claim finds it already closed or moved later", async () => {
    mockPasses([due("event-1")]);
    prisma.event.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.closeDueGalleries(now)).resolves.toMatchObject({ closed: 0, photosRemoved: 0 });
    expect(prisma.photo.findMany).not.toHaveBeenCalled();
    expect(purge.purgeObjects).not.toHaveBeenCalled();
  });

  it("removes a large gallery a chunk at a time", async () => {
    mockPasses([due("event-1")]);
    const fullChunk = Array.from({ length: GALLERY_CLOSE_PHOTO_CHUNK_SIZE }, (_, index) => photo(`p${index}`));
    prisma.photo.findMany.mockResolvedValueOnce(fullChunk as never).mockResolvedValueOnce([photo("last")] as never);

    await expect(service.closeDueGalleries(now)).resolves.toMatchObject({
      photosRemoved: GALLERY_CLOSE_PHOTO_CHUNK_SIZE + 1,
    });
    expect(prisma.photo.deleteMany).toHaveBeenCalledTimes(2);
    expect(purge.purgeObjects).toHaveBeenCalledTimes(2);
  });

  it("sweeps galleries closed earlier that still hold photos no OPEN report needs", async () => {
    mockPasses([], [{ id: "event-2" }]);
    prisma.photo.findMany.mockResolvedValueOnce([photo("p3", 2500)] as never);

    await expect(service.closeDueGalleries(now)).resolves.toMatchObject({
      closed: 0,
      swept: 1,
      photosRemoved: 1,
      bytesRemoved: "2500",
    });
    expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, {
      where: { galleryClosedAt: { not: null }, photos: { some: removable } },
      take: batchSize,
      select: { id: true },
    });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "event.gallery.swept", eventId: "event-2", photosRemoved: 1, audit: true }),
      expect.any(String),
    );
  });

  it("logs and counts a gallery that fails, and carries on with the next", async () => {
    mockPasses([due("event-1"), due("event-2")]);
    prisma.event.updateMany.mockRejectedValueOnce(new Error("deadlock")).mockResolvedValueOnce({ count: 1 });

    await expect(service.closeDueGalleries(now)).resolves.toMatchObject({ closed: 1, failed: 1 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "event.gallery_close.failed", eventId: "event-1" }),
      expect.any(String),
    );
  });
});
