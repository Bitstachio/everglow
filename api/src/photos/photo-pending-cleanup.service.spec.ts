import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PhotoStatus, PrismaClient } from "generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PhotoPendingCleanupService } from "./photo-pending-cleanup.service";

describe("PhotoPendingCleanupService", () => {
  let service: PhotoPendingCleanupService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { deleteObject: jest.Mock };

  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const s3Key = `photos/11111111-1111-1111-1111-111111111111/${eventId}/${photoId}`;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    s3Service = { deleteObject: jest.fn().mockResolvedValue(undefined) };

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

  it("deletes stale pending photos from S3 and the database", async () => {
    prisma.photo.findMany.mockResolvedValue([{ id: photoId, s3Key, eventId }] as never);
    prisma.photo.delete.mockResolvedValue({} as never);

    const result = await service.cleanupStalePendingPhotos();

    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0 });
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
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
    prisma.photo.findMany.mockResolvedValue([]);

    const result = await service.cleanupStalePendingPhotos();

    expect(result).toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
    expect(prisma.photo.delete).not.toHaveBeenCalled();
  });

  it("continues when one photo fails and leaves its row for a later run", async () => {
    const otherPhotoId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const otherS3Key = `photos/11111111-1111-1111-1111-111111111111/${eventId}/${otherPhotoId}`;

    prisma.photo.findMany.mockResolvedValue([
      { id: photoId, s3Key, eventId },
      { id: otherPhotoId, s3Key: otherS3Key, eventId },
    ] as never);
    s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));
    prisma.photo.delete.mockResolvedValue({} as never);

    const result = await service.cleanupStalePendingPhotos();

    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1 });
    expect(prisma.photo.delete).toHaveBeenCalledTimes(1);
    expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: otherPhotoId } });
  });
});
