import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PhotoStatus, Plan, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { EventPlanService } from "src/plans/event-plan.service";
import { PrismaService } from "src/prisma/prisma.service";
import {
  buildPhotoS3Key,
  PHOTO_SERVICE_ERRORS,
  STORAGE_RESERVATION_CONFLICT_CODE,
  STORAGE_RESERVATION_MAX_ATTEMPTS,
} from "./photos.constants";
import { PhotoStorageService, UploadReservationRow } from "./photo-storage.service";

describe("PhotoStorageService", () => {
  let service: PhotoStorageService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  /** The free plan's current version, as the migrations seed it. */
  const freePlan: Plan = {
    id: "f0000000-0000-4000-8000-000000000001",
    code: "FREE",
    version: 2,
    memberLimit: 30,
    storageLimitBytes: 3n * 1024n ** 3n,
    galleryWindowDays: 30,
    galleryWindowOptions: [3, 7, 14, 30],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  const eventId = "66666666-6666-6666-6666-666666666666";

  const buildRow = (sizeBytes: number): UploadReservationRow => {
    const id = randomUUID();
    return {
      id,
      eventId,
      addedById: userId,
      s3Key: buildPhotoS3Key(userId, eventId, id),
      contentType: "image/jpeg",
      sizeBytes,
      status: PhotoStatus.PENDING,
    };
  };

  const serializationFailure = () =>
    new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock.", {
      code: "P2034",
      clientVersion: "7.8.0",
    });

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    prisma.plan.findUnique.mockResolvedValue(freePlan);
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoStorageService,
        EventPlanService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoStorageService);
  });

  describe("reserveUploadBytes", () => {
    // The transaction client is a distinct mock so the tests can prove that
    // both the usage query and the insert go through it, not the root client.
    let tx: DeepMockProxy<Prisma.TransactionClient>;

    const event = {
      id: eventId,
      planId: freePlan.id,
      bonusStorageBytes: 0n,
      galleryOpensAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      galleryClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      galleryClosedAt: null,
    };
    const galleryUsageQuery = {
      where: { eventId, status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] } },
      _sum: { sizeBytes: true },
    };
    /** The storage the gallery already uses. */
    const held = (bytes: number | bigint | null) =>
      ({ _sum: { sizeBytes: bytes === null ? null : Number(bytes) } }) as never;
    const maxGalleryBytes = freePlan.storageLimitBytes;

    beforeEach(() => {
      tx = mockDeep<Prisma.TransactionClient>();
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    });

    it("checks the gallery and inserts the rows inside one serializable transaction", async () => {
      tx.photo.aggregate.mockResolvedValue(held(100));
      tx.photo.createMany.mockResolvedValue({ count: 2 });
      const rows = [buildRow(1024), buildRow(2048)];

      await expect(service.reserveUploadBytes(event, rows)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(tx.photo.aggregate).toHaveBeenCalledWith(galleryUsageQuery);
      expect(tx.photo.createMany).toHaveBeenCalledWith({ data: rows });
      expect(tx.photo.aggregate.mock.invocationCallOrder[0]).toBeLessThan(
        tx.photo.createMany.mock.invocationCallOrder[0],
      );
      expect(prisma.photo.aggregate).not.toHaveBeenCalled();
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
      // The uploader's own quota is no longer read.
      expect(tx.user.findUnique).not.toHaveBeenCalled();
    });

    it("fills the gallery exactly up to its storage, however many photos that is", async () => {
      tx.photo.aggregate.mockResolvedValue(held(maxGalleryBytes! - 300n));
      tx.photo.createMany.mockResolvedValue({ count: 2 });

      await expect(service.reserveUploadBytes(event, [buildRow(100), buildRow(200)])).resolves.toBeUndefined();
    });

    it("refuses a batch that would pass the gallery's storage, with 403, inserting nothing", async () => {
      tx.photo.aggregate.mockResolvedValue(held(maxGalleryBytes! - 100n));

      const reservation = service.reserveUploadBytes(event, [buildRow(50), buildRow(51)]);

      await expect(reservation).rejects.toBeInstanceOf(ForbiddenException);
      await expect(reservation).rejects.toMatchObject({ response: { code: "EVENT_STORAGE_LIMIT_REACHED" } });
      expect(tx.photo.createMany).not.toHaveBeenCalled();
      // A full gallery is a verdict, not a conflict: no retry.
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("counts storage given to this event on top of its plan", async () => {
      const withBonus = { ...event, bonusStorageBytes: 5n * 1024n ** 3n };
      tx.photo.aggregate.mockResolvedValue(held(maxGalleryBytes! + 1n));
      tx.photo.createMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(withBonus, [buildRow(1024)])).resolves.toBeUndefined();
    });

    it("never refuses a gallery whose plan has no storage limit", async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...freePlan, storageLimitBytes: null });
      tx.photo.createMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(event, [buildRow(1)])).resolves.toBeUndefined();
      expect(tx.photo.aggregate).not.toHaveBeenCalled();
    });

    it("treats an empty gallery (a null byte sum) as zero", async () => {
      tx.photo.aggregate.mockResolvedValue(held(null));
      tx.photo.createMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(event, [buildRow(1)])).resolves.toBeUndefined();
    });

    it("refuses a closed gallery before opening a transaction", async () => {
      const closed = { ...event, galleryClosesAt: new Date(Date.now() - 1000) };

      await expect(service.reserveUploadBytes(closed, [buildRow(1)])).rejects.toMatchObject({
        response: { code: "EVENT_GALLERY_CLOSED" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses an upcoming gallery, which opens on the event's date, before opening a transaction", async () => {
      const upcoming = { ...event, galleryOpensAt: new Date(Date.now() + 1000) };

      await expect(service.reserveUploadBytes(upcoming, [buildRow(1)])).rejects.toMatchObject({
        response: { code: "EVENT_GALLERY_NOT_OPEN" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("retries the whole transaction after a serialization failure and succeeds", async () => {
      tx.photo.aggregate.mockResolvedValue(held(0));
      tx.photo.createMany.mockRejectedValueOnce(serializationFailure()).mockResolvedValue({ count: 1 });
      const rows = [buildRow(1024)];

      await expect(service.reserveUploadBytes(event, rows)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      // The retry re-reads the gallery's usage instead of reusing stale values.
      expect(tx.photo.aggregate).toHaveBeenCalledTimes(2);
      expect(tx.photo.createMany).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "photo.storage.reservation_conflict",
          eventId,
          attempt: 1,
          maxAttempts: STORAGE_RESERVATION_MAX_ATTEMPTS,
          willRetry: true,
        }),
        expect.any(String),
      );
    });

    it.each([
      [
        "the driver adapter error Prisma rethrows unmapped when COMMIT fails",
        Object.assign(new Error("TransactionWriteConflict"), {
          name: "DriverAdapterError",
          cause: {
            kind: "TransactionWriteConflict",
            originalCode: "40001",
            originalMessage: "could not serialize access due to read/write dependencies among transactions",
          },
        }),
      ],
      [
        "a raw Postgres error carrying SQLSTATE 40001",
        Object.assign(new Error("could not serialize access"), { code: "40001" }),
      ],
      [
        "a wrapped error whose cause chain ends in a serialization failure",
        new Error("transaction failed", { cause: new Error("inner", { cause: { originalCode: "40001" } }) }),
      ],
    ])("also retries on %s", async (_shape, failure) => {
      tx.photo.aggregate.mockResolvedValue(held(0));
      tx.photo.createMany.mockRejectedValueOnce(failure).mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(event, [buildRow(1024)])).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "photo.storage.reservation_conflict", attempt: 1, willRetry: true }),
        expect.any(String),
      );
    });

    it("gives up with 409 once the retry budget is exhausted", async () => {
      prisma.$transaction.mockRejectedValue(serializationFailure());

      const reservation = service.reserveUploadBytes(event, [buildRow(1024)]);

      await expect(reservation).rejects.toBeInstanceOf(ConflictException);
      await expect(reservation).rejects.toMatchObject({
        response: {
          code: STORAGE_RESERVATION_CONFLICT_CODE,
          message: PHOTO_SERVICE_ERRORS.STORAGE_RESERVATION_CONFLICT,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(STORAGE_RESERVATION_MAX_ATTEMPTS);
      expect(logger.warn).toHaveBeenCalledTimes(STORAGE_RESERVATION_MAX_ATTEMPTS);
      expect(logger.warn).toHaveBeenLastCalledWith(
        expect.objectContaining({ attempt: STORAGE_RESERVATION_MAX_ATTEMPTS, willRetry: false }),
        expect.any(String),
      );
    });

    it("does not retry errors that are not serialization failures", async () => {
      prisma.$transaction.mockRejectedValue(new Error("connection reset"));

      await expect(service.reserveUploadBytes(event, [buildRow(1024)])).rejects.toThrow("connection reset");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not retry other known Prisma errors", async () => {
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
      });
      prisma.$transaction.mockRejectedValue(uniqueViolation);

      await expect(service.reserveUploadBytes(event, [buildRow(1024)])).rejects.toBe(uniqueViolation);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
