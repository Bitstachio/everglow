import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { ListObjectsResult, S3ObjectSummary, S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoOrphanReconcilerService } from "./photo-orphan-reconciler.service";
import { buildPhotoS3Key, PHOTO_S3_KEY_PREFIX } from "./photos.constants";

describe("PhotoOrphanReconcilerService", () => {
  let service: PhotoOrphanReconcilerService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { listObjects: jest.Mock; deleteObject: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let batchSize: number;

  const userId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const HOUR_MS = 60 * 60 * 1000;
  const MIN_AGE_HOURS = 24;

  const keyFor = (photoId: string) => buildPhotoS3Key(userId, eventId, photoId);
  const referencedKey = keyFor("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const orphanKey = keyFor("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  const otherOrphanKey = keyFor("cccccccc-cccc-cccc-cccc-cccccccccccc");
  const legacyOrphanKey = `${PHOTO_S3_KEY_PREFIX}${eventId}/dddddddd-dddd-dddd-dddd-dddddddddddd`;

  const object = (key: string, ageHours = MIN_AGE_HOURS + 1, sizeBytes = 1024): S3ObjectSummary => ({
    key,
    sizeBytes,
    lastModified: new Date(Date.now() - ageHours * HOUR_MS),
  });

  const page = (objects: S3ObjectSummary[], nextContinuationToken?: string): ListObjectsResult => ({
    objects,
    nextContinuationToken,
  });

  const rowsFor = (...keys: string[]) => keys.map((s3Key) => ({ s3Key })) as never;

  beforeEach(async () => {
    batchSize = 100;
    prisma = mockDeep<PrismaClient>();
    prisma.photo.findMany.mockResolvedValue([]);
    s3Service = {
      listObjects: jest.fn().mockResolvedValue(page([])),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoOrphanReconcilerService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "photos.orphanReconcilerBatchSize") return batchSize;
              if (key === "photos.orphanReconcilerMinObjectAgeHours") return MIN_AGE_HOURS;
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoOrphanReconcilerService);
  });

  it("deletes objects without a Photo row and keeps the referenced ones", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(referencedKey), object(orphanKey)]));
    prisma.photo.findMany.mockResolvedValue(rowsFor(referencedKey));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 1, failed: 0, completed: true });
    expect(s3Service.listObjects).toHaveBeenCalledWith(PHOTO_S3_KEY_PREFIX, undefined);
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: [referencedKey, orphanKey] } },
      select: { s3Key: true },
    });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(orphanKey);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "photo.orphan_reconcile.deleted",
        key: orphanKey,
        sizeBytes: 1024,
        audit: true,
      }),
      expect.any(String),
    );
  });

  it("keeps an object whose row exists regardless of the row's status", async () => {
    // The lookup is by key alone: a PENDING row protects its object just like a READY one.
    s3Service.listObjects.mockResolvedValue(page([object(referencedKey)]));
    prisma.photo.findMany.mockResolvedValue(rowsFor(referencedKey));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 1, skipped: 0, deleted: 0, failed: 0, completed: true });
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
  });

  it("skips keys outside the photo layout without looking them up", async () => {
    s3Service.listObjects.mockResolvedValue(
      page([
        object(`${PHOTO_S3_KEY_PREFIX}README.txt`),
        object(`${PHOTO_S3_KEY_PREFIX}${userId}`),
        object(`${orphanKey}/extra`),
        object(`${PHOTO_S3_KEY_PREFIX}${userId}/${eventId}/not-a-uuid`),
        object(orphanKey),
      ]),
    );

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 5, skipped: 4, deleted: 1, failed: 0, completed: true });
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: [orphanKey] } },
      select: { s3Key: true },
    });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(orphanKey);
  });

  it("treats legacy photos/{eventId}/{photoId} keys as candidates", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(legacyOrphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 1, skipped: 0, deleted: 1, failed: 0, completed: true });
    expect(s3Service.deleteObject).toHaveBeenCalledWith(legacyOrphanKey);
  });

  it("skips objects newer than the minimum age and objects without a timestamp", async () => {
    s3Service.listObjects.mockResolvedValue(
      page([object(orphanKey, 1), { key: otherOrphanKey, sizeBytes: 1 }, object(legacyOrphanKey, MIN_AGE_HOURS + 1)]),
    );

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 3, skipped: 2, deleted: 1, failed: 0, completed: true });
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: [legacyOrphanKey] } },
      select: { s3Key: true },
    });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(legacyOrphanKey);
  });

  it("does not query the database for a page with no candidates", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey, 1)]));

    await service.reconcileOrphanedObjects();

    expect(prisma.photo.findMany).not.toHaveBeenCalled();
  });

  it("continues after a failed delete and counts it", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey), object(otherOrphanKey)]));
    s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 1, failed: 1, completed: true });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(2);
    expect(s3Service.deleteObject).toHaveBeenLastCalledWith(otherOrphanKey);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.orphan_reconcile.delete_failed", key: orphanKey }),
      expect.any(String),
    );
  });

  it("walks every page of the listing", async () => {
    s3Service.listObjects
      .mockResolvedValueOnce(page([object(orphanKey)], "token-2"))
      .mockResolvedValueOnce(page([object(otherOrphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 2, failed: 0, completed: true });
    expect(s3Service.listObjects).toHaveBeenCalledTimes(2);
    expect(s3Service.listObjects).toHaveBeenNthCalledWith(1, PHOTO_S3_KEY_PREFIX, undefined);
    expect(s3Service.listObjects).toHaveBeenNthCalledWith(2, PHOTO_S3_KEY_PREFIX, "token-2");
    expect(prisma.photo.findMany).toHaveBeenCalledTimes(2);
  });

  it("stops at the batch cap, reports the run as incomplete, and fetches no further pages", async () => {
    batchSize = 2;
    s3Service.listObjects.mockResolvedValue(
      page([object(orphanKey), object(otherOrphanKey), object(legacyOrphanKey)], "token-2"),
    );

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 3, skipped: 0, deleted: 2, failed: 0, completed: false });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(2);
    expect(s3Service.deleteObject).not.toHaveBeenCalledWith(legacyOrphanKey);
    expect(s3Service.listObjects).toHaveBeenCalledTimes(1);
  });

  it("counts failed deletes against the batch cap", async () => {
    batchSize = 1;
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey), object(otherOrphanKey)]));
    s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 0, failed: 1, completed: false });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("completes a run that deletes exactly the batch cap with nothing left over", async () => {
    batchSize = 1;
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 1, skipped: 0, deleted: 1, failed: 0, completed: true });
  });

  it("returns zero counts for an empty prefix and still logs the summary", async () => {
    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: true });
    expect(prisma.photo.findMany).not.toHaveBeenCalled();
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "photo.orphan_reconcile.completed",
        scanned: 0,
        deleted: 0,
        failed: 0,
        completed: true,
        minObjectAgeHours: MIN_AGE_HOURS,
        audit: true,
      }),
      expect.any(String),
    );
  });

  it("propagates a listing failure so the scheduler can report the run", async () => {
    s3Service.listObjects.mockRejectedValue(new Error("list failed"));

    await expect(service.reconcileOrphanedObjects()).rejects.toThrow("list failed");

    expect(s3Service.deleteObject).not.toHaveBeenCalled();
  });
});
