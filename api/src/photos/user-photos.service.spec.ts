import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { encodeKeysetCursor } from "src/common/pagination/keyset-cursor";
import { ImageUploadService } from "src/images/image-upload.service";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoPurgeService } from "./photo-purge.service";
import { UserPhotosService } from "./user-photos.service";

describe("UserPhotosService", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const wedding = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const lisbon = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const office = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const now = new Date("2026-06-10T12:00:00.000Z");

  let service: UserPhotosService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { getPresignedDownloadUrl: jest.Mock };
  let imageUploads: { getDownloadUrl: jest.Mock };
  let photoPurgeService: { purgeObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    s3Service = { getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://signed-get") };
    imageUploads = {
      getDownloadUrl: jest.fn((key: string | null) => Promise.resolve(key ? `https://cover/${key}` : null)),
    };
    photoPurgeService = { purgeObjects: jest.fn().mockResolvedValue({ requested: 0, deleted: 0, failed: 0 }) };
    logger = { setContext: jest.fn(), info: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPhotosService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        { provide: ImageUploadService, useValue: imageUploads },
        { provide: PhotoPurgeService, useValue: photoPurgeService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(UserPhotosService);
  });

  describe("usageByEvent", () => {
    beforeEach(() => {
      prisma.photo.groupBy.mockResolvedValue([
        { eventId: lisbon, _count: { _all: 98 }, _sum: { sizeBytes: 640_000_000 } },
        { eventId: wedding, _count: { _all: 214 }, _sum: { sizeBytes: 1_200_000_000 } },
        { eventId: office, _count: { _all: 41 }, _sum: { sizeBytes: 310_000_000 } },
      ] as never);
      prisma.event.findMany.mockResolvedValue([
        { id: wedding, title: "Sara's wedding", coverS3Key: "event-covers/w/1" },
        { id: lisbon, title: "Lisbon trip", coverS3Key: null },
        { id: office, title: "Office party", coverS3Key: null },
      ] as never);
      prisma.eventAccess.findMany.mockResolvedValue([{ eventId: wedding }] as never);
      prisma.eventBan.findMany.mockResolvedValue([{ eventId: office }] as never);
    });

    it("returns one row per event, largest first, with how the caller relates to it", async () => {
      await expect(service.usageByEvent(userId)).resolves.toEqual([
        {
          eventId: wedding,
          title: "Sara's wedding",
          coverUrl: "https://cover/event-covers/w/1",
          membership: "MEMBER",
          photoCount: 214,
          bytes: 1_200_000_000n,
        },
        {
          eventId: lisbon,
          title: "Lisbon trip",
          coverUrl: null,
          membership: "LEFT",
          photoCount: 98,
          bytes: 640_000_000n,
        },
        {
          eventId: office,
          title: "Office party",
          coverUrl: null,
          membership: "REMOVED",
          photoCount: 41,
          bytes: 310_000_000n,
        },
      ]);
    });

    it("counts the same photos as the quota, so the rows add up to usedBytes", async () => {
      await service.usageByEvent(userId);

      expect(prisma.photo.groupBy).toHaveBeenCalledWith({
        by: ["eventId"],
        where: { addedById: userId, status: { in: ["PENDING", "READY"] } },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      });
    });

    it("asks nothing more when the caller has no photos", async () => {
      prisma.photo.groupBy.mockResolvedValue([] as never);

      await expect(service.usageByEvent(userId)).resolves.toEqual([]);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });
  });

  describe("listInEvent", () => {
    it("pages the caller's own READY photos in the event, member or not, with no visibility filter", async () => {
      const photo = {
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        s3Key: "photos/d",
        sizeBytes: 2_000_000,
        createdAt: now,
      };
      prisma.photo.findMany.mockResolvedValue([photo] as never);

      await expect(service.listInEvent(userId, lisbon, { limit: 20 })).resolves.toEqual({
        items: [{ ...photo, url: "https://signed-get" }],
        nextCursor: null,
      });
      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ eventId: lisbon, addedById: userId, status: "READY" }] },
          take: 21,
        }),
      );
    });

    it("continues after the cursor", async () => {
      prisma.photo.findMany.mockResolvedValue([]);
      const cursor = encodeKeysetCursor({ createdAt: now, id: "dddddddd-dddd-dddd-dddd-dddddddddddd" });

      await service.listInEvent(userId, lisbon, { cursor, limit: 20 });

      const [args] = prisma.photo.findMany.mock.calls[0];
      expect((args?.where?.AND as unknown[]).length).toBe(2);
    });
  });

  describe("deleteInEvent", () => {
    beforeEach(() => {
      prisma.photo.findMany.mockResolvedValue([
        { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", s3Key: "photos/d", sizeBytes: 3_000_000 },
      ] as never);
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });
      prisma.report.updateMany.mockResolvedValue({ count: 0 });
    });

    it("deletes the caller's photos in the event, audits it, and purges the objects after the commit", async () => {
      await expect(service.deleteInEvent(userId, lisbon)).resolves.toEqual({
        photosDeleted: 1,
        bytesFreed: 3_000_000n,
      });

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: lisbon, addedById: userId, id: { notIn: [] } } }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "user.storage.photos_deleted",
          userId,
          eventId: lisbon,
          scope: "all",
          photosDeleted: 1,
          bytesFreed: "3000000",
          audit: true,
        }),
        expect.any(String),
      );
      expect(photoPurgeService.purgeObjects).toHaveBeenCalledWith(["photos/d"], {
        event: "user.storage.photos_purged",
        userId,
        eventId: lisbon,
      });
      expect(photoPurgeService.purgeObjects.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it("deletes only the selected photos when ids are given", async () => {
      await service.deleteInEvent(userId, lisbon, ["dddddddd-dddd-dddd-dddd-dddddddddddd"]);

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: lisbon,
            addedById: userId,
            id: { in: ["dddddddd-dddd-dddd-dddd-dddddddddddd"], notIn: [] },
          },
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ scope: "selected" }), expect.any(String));
    });
  });
});
