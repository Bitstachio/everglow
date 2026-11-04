import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PhotoHashBackfillService } from "./photo-hash-backfill.service";
import { PHOTO_HASH_TIMEOUT_MS } from "./photos.constants";

describe("PhotoHashBackfillService", () => {
  const now = new Date("2027-01-10T12:00:00.000Z");
  const a = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", s3Key: "photos/u/e/a" };
  const b = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", s3Key: "photos/u/e/b" };
  const hashA = "aa".repeat(32);
  const hashB = "bb".repeat(32);

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { sha256OfObject: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let service: PhotoHashBackfillService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.photo.updateMany.mockResolvedValue({ count: 1 });
    s3Service = {
      sha256OfObject: jest.fn((key: string) => Promise.resolve(key.endsWith("a") ? hashA : hashB)),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = { getOrThrow: jest.fn((key: string) => (key === "photos.hashBackfillBatchSize" ? 50 : undefined)) };
    service = new PhotoHashBackfillService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      config as unknown as ConfigService,
      logger as unknown as PinoLogger,
    );
  });

  it("hashes a batch of READY photos without a hash, oldest untouched first", async () => {
    prisma.photo.findMany.mockResolvedValue([a, b] as never);

    await expect(service.runBackfill(now)).resolves.toEqual({ hashed: 2, failed: 0 });

    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { status: "READY", sha256: null },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 50,
      select: { id: true, s3Key: true },
    });
    expect(s3Service.sha256OfObject).toHaveBeenCalledWith(a.s3Key, { timeoutMs: PHOTO_HASH_TIMEOUT_MS });
    // Guarded on a null hash, so a concurrent writer's hash is never overwritten.
    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: a.id, sha256: null },
      data: { sha256: hashA },
    });
    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: b.id, sha256: null },
      data: { sha256: hashB },
    });
  });

  it("does nothing when every photo has its hash", async () => {
    prisma.photo.findMany.mockResolvedValue([]);

    await expect(service.runBackfill(now)).resolves.toEqual({ hashed: 0, failed: 0 });
    expect(s3Service.sha256OfObject).not.toHaveBeenCalled();
  });

  it("moves a photo it can't read behind the rest of the queue", async () => {
    prisma.photo.findMany.mockResolvedValue([a, b] as never);
    s3Service.sha256OfObject.mockImplementation((key: string) =>
      key.endsWith("a") ? Promise.reject(new Error("gone")) : Promise.resolve(hashB),
    );

    await expect(service.runBackfill(now)).resolves.toEqual({ hashed: 1, failed: 1 });

    expect(prisma.photo.updateMany).toHaveBeenCalledWith({
      where: { id: a.id, sha256: null },
      data: { updatedAt: now },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "photo.hash_backfill.read_failed", failed: 1 }),
      expect.any(String),
    );
  });
});
