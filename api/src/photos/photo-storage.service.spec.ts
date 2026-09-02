import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PhotoStatus, Prisma, PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { USER_SERVICE_ERRORS } from "src/users/users.constants";
import {
  buildPhotoS3Key,
  FREE_TIER_STORAGE_LIMIT_BYTES,
  PHOTO_SERVICE_ERRORS,
  STORAGE_QUOTA_EXCEEDED_CODE,
  STORAGE_RESERVATION_CONFLICT_CODE,
  STORAGE_RESERVATION_MAX_ATTEMPTS,
} from "./photos.constants";
import { PhotoStorageService, UploadReservationRow } from "./photo-storage.service";

describe("PhotoStorageService", () => {
  let service: PhotoStorageService;
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const userId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";

  const usageWhere = {
    addedById: userId,
    status: { in: [PhotoStatus.PENDING, PhotoStatus.READY] },
  };
  const limitQuery = { where: { id: userId }, select: { storageLimitBytes: true } };

  const ONE_GIB = 1024n ** 3n;
  const TEN_GIB = 10n * ONE_GIB;
  const userWithLimit = (storageLimitBytes: bigint) => ({ storageLimitBytes }) as never;

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
    prisma.user.findUnique.mockResolvedValue(userWithLimit(FREE_TIER_STORAGE_LIMIT_BYTES));
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhotoStorageService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(PhotoStorageService);
  });

  it("returns storage usage for a user", async () => {
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 } } as never);

    await expect(service.getStorageForUser(userId)).resolves.toEqual({
      usedBytes: "1024",
      limitBytes: FREE_TIER_STORAGE_LIMIT_BYTES.toString(),
      remainingBytes: (FREE_TIER_STORAGE_LIMIT_BYTES - 1024n).toString(),
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith(limitQuery);
    expect(prisma.photo.aggregate).toHaveBeenCalledWith({
      where: usageWhere,
      _sum: { sizeBytes: true },
    });
  });

  it("reports the caller's own limit rather than the free-tier default", async () => {
    prisma.user.findUnique.mockResolvedValue(userWithLimit(TEN_GIB));
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 } } as never);

    await expect(service.getStorageForUser(userId)).resolves.toEqual({
      usedBytes: "1024",
      limitBytes: TEN_GIB.toString(),
      remainingBytes: (TEN_GIB - 1024n).toString(),
    });
  });

  it("rejects with 404 when the user row does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const snapshot = service.getStorageForUser(userId);

    await expect(snapshot).rejects.toBeInstanceOf(NotFoundException);
    await expect(snapshot).rejects.toThrow(USER_SERVICE_ERRORS.NOT_FOUND(userId));
  });

  it("allows uploads within the remaining quota", async () => {
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 100 } } as never);

    await expect(service.assertCanUpload(userId, 200)).resolves.toBeUndefined();
  });

  it("rejects uploads that would exceed the quota", async () => {
    const usedBytes = FREE_TIER_STORAGE_LIMIT_BYTES - 100n;
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: Number(usedBytes) } } as never);

    await expect(service.assertCanUpload(userId, 200)).rejects.toMatchObject({
      response: {
        code: STORAGE_QUOTA_EXCEEDED_CODE,
        message: PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED,
        usedBytes: usedBytes.toString(),
        limitBytes: FREE_TIER_STORAGE_LIMIT_BYTES.toString(),
        requestedBytes: "200",
      },
    });
    await expect(service.assertCanUpload(userId, 200)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it("enforces the caller's own limit, not the free-tier default", async () => {
    // Above the free tier but under this user's raised ceiling: allowed.
    prisma.user.findUnique.mockResolvedValue(userWithLimit(TEN_GIB));
    prisma.photo.aggregate.mockResolvedValue({
      _sum: { sizeBytes: Number(FREE_TIER_STORAGE_LIMIT_BYTES + 1n) },
    } as never);
    await expect(service.assertCanUpload(userId, 200)).resolves.toBeUndefined();

    // Under the free tier but over this user's lowered ceiling: rejected.
    prisma.user.findUnique.mockResolvedValue(userWithLimit(ONE_GIB));
    prisma.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: Number(ONE_GIB - 100n) } } as never);
    await expect(service.assertCanUpload(userId, 200)).rejects.toMatchObject({
      response: {
        code: STORAGE_QUOTA_EXCEEDED_CODE,
        usedBytes: (ONE_GIB - 100n).toString(),
        limitBytes: ONE_GIB.toString(),
        requestedBytes: "200",
      },
    });
  });

  describe("reserveUploadBytes", () => {
    // The transaction client is a distinct mock so the tests can prove that
    // both the usage query and the insert go through it, not the root client.
    let tx: DeepMockProxy<Prisma.TransactionClient>;

    beforeEach(() => {
      tx = mockDeep<Prisma.TransactionClient>();
      tx.user.findUnique.mockResolvedValue(userWithLimit(FREE_TIER_STORAGE_LIMIT_BYTES));
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    });

    it("checks usage and inserts the rows inside one serializable transaction", async () => {
      tx.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 100 } } as never);
      tx.photo.createMany.mockResolvedValue({ count: 2 });
      const rows = [buildRow(1024), buildRow(2048)];

      await expect(service.reserveUploadBytes(userId, rows)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(tx.user.findUnique).toHaveBeenCalledWith(limitQuery);
      expect(tx.photo.aggregate).toHaveBeenCalledWith({ where: usageWhere, _sum: { sizeBytes: true } });
      expect(tx.photo.createMany).toHaveBeenCalledWith({ data: rows });
      expect(tx.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        tx.photo.createMany.mock.invocationCallOrder[0],
      );
      expect(tx.photo.aggregate.mock.invocationCallOrder[0]).toBeLessThan(
        tx.photo.createMany.mock.invocationCallOrder[0],
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.photo.aggregate).not.toHaveBeenCalled();
      expect(prisma.photo.createMany).not.toHaveBeenCalled();
    });

    it("reserves against the caller's own limit read inside the transaction", async () => {
      tx.user.findUnique.mockResolvedValue(userWithLimit(TEN_GIB));
      tx.photo.aggregate.mockResolvedValue({
        _sum: { sizeBytes: Number(FREE_TIER_STORAGE_LIMIT_BYTES + 1n) },
      } as never);
      tx.photo.createMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(userId, [buildRow(1024)])).resolves.toBeUndefined();

      expect(tx.photo.createMany).toHaveBeenCalledTimes(1);
    });

    it("rejects with 404 and inserts nothing when the uploader row is missing", async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(service.reserveUploadBytes(userId, [buildRow(1024)])).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.photo.createMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("reserves exactly up to the limit", async () => {
      tx.photo.aggregate.mockResolvedValue({
        _sum: { sizeBytes: Number(FREE_TIER_STORAGE_LIMIT_BYTES - 300n) },
      } as never);
      tx.photo.createMany.mockResolvedValue({ count: 2 });

      await expect(service.reserveUploadBytes(userId, [buildRow(100), buildRow(200)])).resolves.toBeUndefined();

      expect(tx.photo.createMany).toHaveBeenCalledTimes(1);
    });

    it("rejects with 413 and inserts nothing when the batch would exceed the quota", async () => {
      const usedBytes = FREE_TIER_STORAGE_LIMIT_BYTES - 100n;
      tx.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: Number(usedBytes) } } as never);
      const rows = [buildRow(50), buildRow(51)];

      await expect(service.reserveUploadBytes(userId, rows)).rejects.toMatchObject({
        response: {
          code: STORAGE_QUOTA_EXCEEDED_CODE,
          message: PHOTO_SERVICE_ERRORS.STORAGE_QUOTA_EXCEEDED,
          usedBytes: usedBytes.toString(),
          limitBytes: FREE_TIER_STORAGE_LIMIT_BYTES.toString(),
          requestedBytes: "101",
        },
      });
      expect(tx.photo.createMany).not.toHaveBeenCalled();
      // Over quota is a verdict, not a conflict: no retry.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("treats a null usage sum (no photos yet) as zero", async () => {
      tx.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } } as never);
      tx.photo.createMany.mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(userId, [buildRow(1)])).resolves.toBeUndefined();

      expect(tx.photo.createMany).toHaveBeenCalledTimes(1);
    });

    it("retries the whole transaction after a serialization failure and succeeds", async () => {
      tx.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);
      tx.photo.createMany.mockRejectedValueOnce(serializationFailure()).mockResolvedValue({ count: 1 });
      const rows = [buildRow(1024)];

      await expect(service.reserveUploadBytes(userId, rows)).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      // The retry re-reads limit and usage instead of reusing stale values.
      expect(tx.user.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.photo.aggregate).toHaveBeenCalledTimes(2);
      expect(tx.photo.createMany).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "photo.storage.reservation_conflict",
          userId,
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
      tx.photo.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } } as never);
      tx.photo.createMany.mockRejectedValueOnce(failure).mockResolvedValue({ count: 1 });

      await expect(service.reserveUploadBytes(userId, [buildRow(1024)])).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "photo.storage.reservation_conflict", attempt: 1, willRetry: true }),
        expect.any(String),
      );
    });

    it("gives up with 409 once the retry budget is exhausted", async () => {
      prisma.$transaction.mockRejectedValue(serializationFailure());

      const reservation = service.reserveUploadBytes(userId, [buildRow(1024)]);

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

      await expect(service.reserveUploadBytes(userId, [buildRow(1024)])).rejects.toThrow("connection reset");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not retry other known Prisma errors", async () => {
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
      });
      prisma.$transaction.mockRejectedValue(uniqueViolation);

      await expect(service.reserveUploadBytes(userId, [buildRow(1024)])).rejects.toBe(uniqueViolation);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
