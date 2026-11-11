import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PHOTO_HASH_TIMEOUT_MS } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "./evidence.service";
import { IDENTICAL_COPIES_CHUNK_SIZE, IdenticalCopiesService } from "./identical-copies.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "./testing/evidence-service.mock";

describe("IdenticalCopiesService", () => {
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const moderatorId = "99999999-9999-9999-9999-999999999999";
  const sha256 = "ab".repeat(32);
  const now = new Date("2027-01-10T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { sha256OfObject: jest.Mock; deleteObjects: jest.Mock };
  let evidence: EvidenceServiceMock;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let service: IdenticalCopiesService;

  const removedImage = (overrides: Record<string, unknown> = {}) => ({
    id: reportId,
    resolvedById: moderatorId,
    holdUntil: null,
    holdReason: null,
    evidence: { id: "ev-1", sha256, objectS3Key: null },
    ...overrides,
  });

  const copy = (n: number) => {
    const id = `${String(n).padStart(8, "0")}-1111-4222-8333-444444444444`;
    return {
      id,
      eventId: `event-${n}`,
      s3Key: `photos/uploader/event-${n}/${id}`,
      contentType: "image/jpeg",
      sizeBytes: 2048,
      addedById: `uploader-${n}`,
      event: { title: `Roll ${n}` },
    };
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.$transaction.mockImplementation(async (fn) => (fn as (tx: unknown) => Promise<unknown>)(prisma));
    prisma.report.create.mockImplementation(
      (args) => Promise.resolve({ id: `linked-${(args.data as { photoId: string }).photoId}` }) as never,
    );
    prisma.report.updateManyAndReturn.mockResolvedValue([]);
    prisma.photo.deleteMany.mockResolvedValue({ count: 0 });
    s3Service = {
      sha256OfObject: jest.fn().mockResolvedValue(sha256),
      deleteObjects: jest.fn((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] })),
    };
    evidence = buildEvidenceServiceMock();
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = { getOrThrow: jest.fn(() => 365) };
    service = new IdenticalCopiesService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      config as unknown as ConfigService,
      evidence as unknown as EvidenceService,
      logger as unknown as PinoLogger,
    );
  });

  describe("findRemovedImages", () => {
    it("matches hashes of actioned intimate-image reports closed within the window, or still held", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([{ sha256, reportId }] as never);

      const removed = await service.findRemovedImages([sha256, sha256, "cd".repeat(32)], now);

      expect(removed).toEqual(new Map([[sha256, reportId]]));
      expect(prisma.reportEvidence.findMany).toHaveBeenCalledWith({
        where: {
          sha256: { in: [sha256, "cd".repeat(32)] },
          report: {
            reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
            status: "ACTIONED",
            OR: [{ resolvedAt: { gte: new Date(now.getTime() - 365 * day) } }, { holdUntil: { gt: now } }],
          },
        },
        select: { sha256: true, reportId: true },
      });
    });

    it("asks nothing for no hashes", async () => {
      await expect(service.findRemovedImages([])).resolves.toEqual(new Map());
      expect(prisma.reportEvidence.findMany).not.toHaveBeenCalled();
    });
  });

  describe("removeCopies", () => {
    it("looks only at actioned intimate-image reports", async () => {
      prisma.report.findMany.mockResolvedValue([]);

      await expect(service.removeCopies([reportId], now)).resolves.toEqual([]);

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [reportId] }, reason: "NON_CONSENSUAL_INTIMATE_IMAGE", status: "ACTIONED" },
        }),
      );
      expect(prisma.photo.findMany).not.toHaveBeenCalled();
    });

    it("removes every READY photo with the same hash, each under a linked report with evidence", async () => {
      prisma.report.findMany.mockResolvedValue([removedImage()] as never);
      prisma.photo.findMany.mockResolvedValueOnce([copy(1), copy(2)] as never);
      prisma.report.updateManyAndReturn.mockResolvedValue([{ id: "open-on-copy-1" }] as never);

      const closed = await service.removeCopies([reportId], now);

      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sha256, status: "READY" }, take: IDENTICAL_COPIES_CHUNK_SIZE }),
      );
      // A linked report per copy, already actioned by the moderator who removed the image.
      expect(prisma.report.create).toHaveBeenCalledTimes(2);
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          eventId: "event-1",
          eventTitle: "Roll 1",
          reporterId: null,
          source: "AUTOMATED",
          targetType: "PHOTO",
          photoId: copy(1).id,
          reportedUserId: "uploader-1",
          reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
          queue: "PLATFORM",
          escalationReasons: ["INTIMATE_IMAGE"],
          escalatedAt: now,
          status: "ACTIONED",
          closedReason: "PHOTO_REMOVED",
          holdUntil: null,
          holdReason: null,
          closedByRole: "PLATFORM",
          resolvedById: moderatorId,
          resolvedAt: now,
        },
        select: { id: true },
      });
      expect(evidence.writeSnapshot).toHaveBeenCalledWith(prisma, `linked-${copy(1).id}`, {
        objectS3Key: copy(1).s3Key,
        contentType: "image/jpeg",
        sizeBytes: 2048,
        subjectUserId: "uploader-1",
      });
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
        where: { reportId: `linked-${copy(1).id}` },
        data: { sha256 },
      });
      // The copies' own OPEN reports close as the platform's verdict, then the rows go at once.
      expect(prisma.report.updateManyAndReturn).toHaveBeenCalledWith({
        where: { photoId: { in: [copy(1).id, copy(2).id] }, status: "OPEN" },
        data: {
          status: "ACTIONED",
          closedReason: "PHOTO_REMOVED",
          closedByRole: "PLATFORM",
          resolvedById: moderatorId,
          resolvedAt: now,
        },
        select: { id: true },
      });
      expect(prisma.photo.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [copy(1).id, copy(2).id] } } });
      // Objects after the rows, through the evidence copy.
      expect(evidence.preserveBeforeDelete).toHaveBeenCalledWith([copy(1).s3Key, copy(2).s3Key]);
      expect(evidence.preserveBeforeDelete.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.photo.deleteMany.mock.invocationCallOrder[0],
      );
      expect(s3Service.deleteObjects).toHaveBeenCalledWith([
        copy(1).s3Key,
        `derived/${copy(1).s3Key}/thumb.webp`,
        `derived/${copy(1).s3Key}/large.jpg`,
        copy(2).s3Key,
        `derived/${copy(2).s3Key}/thumb.webp`,
        `derived/${copy(2).s3Key}/large.jpg`,
      ]);
      expect(closed).toEqual([`linked-${copy(1).id}`, `linked-${copy(2).id}`, "open-on-copy-1"]);
      // A count only: no photo ids, no hash.
      expect(logger.info).toHaveBeenCalledWith(
        { event: "report.identical_copies_removed", reportId, count: 2, audit: true },
        expect.any(String),
      );
    });

    it("works through many copies a chunk at a time", async () => {
      prisma.report.findMany.mockResolvedValue([removedImage()] as never);
      const full = Array.from({ length: IDENTICAL_COPIES_CHUNK_SIZE }, (_, index) => copy(index));
      prisma.photo.findMany.mockResolvedValueOnce(full as never).mockResolvedValueOnce([copy(1000)] as never);

      await service.removeCopies([reportId], now);

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.photo.findMany).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ count: IDENTICAL_COPIES_CHUNK_SIZE + 1 }),
        expect.any(String),
      );
    });

    it("holds the copies of a held image", async () => {
      const holdUntil = new Date("2027-06-01T00:00:00.000Z");
      prisma.report.findMany.mockResolvedValue([removedImage({ holdUntil, holdReason: "LAW_ENFORCEMENT" })] as never);
      prisma.photo.findMany.mockResolvedValueOnce([copy(1)] as never);

      await service.removeCopies([reportId], now);

      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ holdUntil, holdReason: "LAW_ENFORCEMENT" }) as unknown,
        }),
      );
    });

    it("logs a count of zero when there are no copies", async () => {
      prisma.report.findMany.mockResolvedValue([removedImage()] as never);
      prisma.photo.findMany.mockResolvedValueOnce([]);

      await expect(service.removeCopies([reportId], now)).resolves.toEqual([]);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }), expect.any(String));
    });

    it("hashes the kept original when the evidence copy failed, and records the hash", async () => {
      prisma.report.findMany.mockResolvedValue([
        removedImage({ evidence: { id: "ev-1", sha256: null, objectS3Key: "photos/u/e/p" } }),
      ] as never);
      prisma.photo.findMany.mockResolvedValueOnce([]);

      await service.removeCopies([reportId], now);

      expect(s3Service.sha256OfObject).toHaveBeenCalledWith("photos/u/e/p", { timeoutMs: PHOTO_HASH_TIMEOUT_MS });
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({ where: { id: "ev-1" }, data: { sha256 } });
      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sha256, status: "READY" } }),
      );
    });

    it("removes nothing when the hash is unknown, and says so", async () => {
      prisma.report.findMany.mockResolvedValue([
        removedImage({ evidence: { id: "ev-1", sha256: null, objectS3Key: "photos/u/e/p" } }),
        removedImage({ id: "other", evidence: null }),
      ] as never);
      s3Service.sha256OfObject.mockRejectedValue(new Error("gone"));

      await expect(service.removeCopies([reportId, "other"], now)).resolves.toEqual([]);

      expect(prisma.photo.findMany).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.identical_copies.hash_failed", reportId }),
        expect.any(String),
      );
    });

    it("keeps going when the objects can't be deleted: the rows are already gone", async () => {
      prisma.report.findMany.mockResolvedValue([removedImage()] as never);
      prisma.photo.findMany.mockResolvedValueOnce([copy(1)] as never);
      s3Service.deleteObjects.mockRejectedValue(new Error("s3 down"));

      await expect(service.removeCopies([reportId], now)).resolves.toEqual([`linked-${copy(1).id}`]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.identical_copies.objects_retained", reportId }),
        expect.any(String),
      );
    });

    it("never deletes a copy whose evidence copy failed", async () => {
      prisma.report.findMany.mockResolvedValue([removedImage()] as never);
      prisma.photo.findMany.mockResolvedValueOnce([copy(1)] as never);
      evidence.preserveBeforeDelete.mockResolvedValue({ deletable: [], retained: [copy(1).s3Key] });

      await service.removeCopies([reportId], now);

      expect(s3Service.deleteObjects).not.toHaveBeenCalled();
    });
  });
});
