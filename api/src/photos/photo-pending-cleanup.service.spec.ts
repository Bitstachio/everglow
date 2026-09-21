import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus, PrismaClient } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";
import { EXPIRED_UPLOAD_SLOT_AGE_SECONDS, UPLOAD_URL_TTL_SECONDS } from "./photos.constants";

describe("PhotoPendingCleanupService", () => {
  let service: PhotoPendingCleanupService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { deleteObject: jest.Mock; headObject: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const otherPhotoId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const s3Key = `photos/${userId}/${eventId}/${photoId}`;
  const otherS3Key = `photos/${userId}/${eventId}/${otherPhotoId}`;

  const noExpired = { scanned: 0, released: 0, retained: 0, failed: 0 };

  /** First findMany call is the stale tier, second is the expired tier. */
  const stubTiers = (stale: unknown[], expired: unknown[] = []) => {
    prisma.photo.findMany.mockResolvedValueOnce(stale as never).mockResolvedValueOnce(expired as never);
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    s3Service = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
      headObject: jest.fn().mockResolvedValue({ exists: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoPendingCleanupService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "photos.pendingCleanupMaxAgeHours") return 24;
              if (key === "photos.pendingCleanupBatchSize") return 100;
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
        { provide: PinoLogger, useValue: { setContext: jest.fn(), info: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(PhotoPendingCleanupService);
  });

  describe("stale tier", () => {
    it("deletes stale pending photos from S3 and the database", async () => {
      stubTiers([{ id: photoId, s3Key, eventId }]);
      prisma.photo.delete.mockResolvedValue({} as never);

      const result = await service.cleanupStalePendingPhotos();

      expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0, expired: noExpired });
      expect(prisma.photo.findMany).toHaveBeenNthCalledWith(1, {
        where: { status: PhotoStatus.PENDING, createdAt: { lt: expect.any(Date) as Date } },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, s3Key: true, eventId: true },
      });
      expect(s3Service.deleteObject).toHaveBeenCalledWith(s3Key);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: photoId } });
      expect(s3Service.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.photo.delete.mock.invocationCallOrder[0],
      );
    });

    it("returns zero counts when there is nothing to clean up", async () => {
      stubTiers([]);

      const result = await service.cleanupStalePendingPhotos();

      expect(result).toEqual({ scanned: 0, deleted: 0, failed: 0, expired: noExpired });
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(s3Service.headObject).not.toHaveBeenCalled();
      expect(prisma.photo.delete).not.toHaveBeenCalled();
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("continues when one photo fails and leaves its row for a later run", async () => {
      stubTiers([
        { id: photoId, s3Key, eventId },
        { id: otherPhotoId, s3Key: otherS3Key, eventId },
      ]);
      s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));
      prisma.photo.delete.mockResolvedValue({} as never);

      const result = await service.cleanupStalePendingPhotos();

      expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1, expired: noExpired });
      expect(prisma.photo.delete).toHaveBeenCalledTimes(1);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: otherPhotoId } });
    });
  });

  describe("expired tier", () => {
    it("only considers rows between the expired cutoff and the stale cutoff", async () => {
      const now = new Date("2026-09-21T12:00:00.000Z");
      jest.useFakeTimers({ now });
      try {
        stubTiers([], []);

        await service.cleanupStalePendingPhotos();

        expect(prisma.photo.findMany).toHaveBeenNthCalledWith(2, {
          where: {
            status: PhotoStatus.PENDING,
            createdAt: {
              // Lower bound is the stale tier's cutoff (24h); upper bound is URL TTL plus grace.
              gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
              lt: new Date(now.getTime() - EXPIRED_UPLOAD_SLOT_AGE_SECONDS * 1000),
            },
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: { id: true, s3Key: true, eventId: true },
        });
        expect(EXPIRED_UPLOAD_SLOT_AGE_SECONDS).toBeGreaterThan(UPLOAD_URL_TTL_SECONDS);
      } finally {
        jest.useRealTimers();
      }
    });

    it("releases an expired slot whose key holds no object, without touching S3 objects", async () => {
      stubTiers([], [{ id: photoId, s3Key, eventId }]);
      s3Service.headObject.mockResolvedValue({ exists: false });
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.cleanupStalePendingPhotos();

      expect(result.expired).toEqual({ scanned: 1, released: 1, retained: 0, failed: 0 });
      expect(s3Service.headObject).toHaveBeenCalledWith(s3Key);
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: photoId, status: PhotoStatus.PENDING },
      });
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.photo.delete).not.toHaveBeenCalled();
    });

    it("keeps an expired slot whose object landed, so the uploader can still confirm it", async () => {
      stubTiers([], [{ id: photoId, s3Key, eventId }]);
      s3Service.headObject.mockResolvedValue({ exists: true, contentType: "image/jpeg", sizeBytes: 10 });

      const result = await service.cleanupStalePendingPhotos();

      expect(result.expired).toEqual({ scanned: 1, released: 0, retained: 1, failed: 0 });
      expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("does not count a row that a concurrent confirm flipped to READY", async () => {
      stubTiers([], [{ id: photoId, s3Key, eventId }]);
      s3Service.headObject.mockResolvedValue({ exists: false });
      // The status guard on the delete matched nothing.
      prisma.photo.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.cleanupStalePendingPhotos();

      expect(result.expired).toEqual({ scanned: 1, released: 0, retained: 0, failed: 0 });
    });

    it("continues past a failed head check and leaves that row for the next run", async () => {
      stubTiers(
        [],
        [
          { id: photoId, s3Key, eventId },
          { id: otherPhotoId, s3Key: otherS3Key, eventId },
        ],
      );
      s3Service.headObject.mockRejectedValueOnce(new Error("s3 down")).mockResolvedValueOnce({ exists: false });
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.cleanupStalePendingPhotos();

      expect(result.expired).toEqual({ scanned: 2, released: 1, retained: 0, failed: 1 });
      expect(prisma.photo.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({
        where: { id: otherPhotoId, status: PhotoStatus.PENDING },
      });
    });

    it("runs after the stale tier and reports both", async () => {
      stubTiers([{ id: photoId, s3Key, eventId }], [{ id: otherPhotoId, s3Key: otherS3Key, eventId }]);
      prisma.photo.delete.mockResolvedValue({} as never);
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.cleanupStalePendingPhotos();

      expect(result).toEqual({
        scanned: 1,
        deleted: 1,
        failed: 0,
        expired: { scanned: 1, released: 1, retained: 0, failed: 0 },
      });
      expect(prisma.photo.delete.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.photo.deleteMany.mock.invocationCallOrder[0],
      );
    });
  });
});
