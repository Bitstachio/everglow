import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "./evidence.service";

describe("EvidenceService", () => {
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const otherReportId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const photoKey = "photos/u/e/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const otherKey = "photos/u/e/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const now = new Date("2027-10-06T04:00:00.000Z");

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { copyObject: jest.Mock; deleteObject: jest.Mock; deleteObjects: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let service: EvidenceService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    s3Service = {
      copyObject: jest.fn().mockResolvedValue({ sha256: "ab".repeat(32) }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      deleteObjects: jest.fn(),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const config = {
      getOrThrow: jest.fn(
        (key: string) => ({ "moderation.evidenceJobBatchSize": 50, "moderation.reportRetentionDays": 365 })[key],
      ),
    };
    service = new EvidenceService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      config as unknown as ConfigService,
      logger as unknown as PinoLogger,
    );
    prisma.reportEvidence.update.mockResolvedValue({} as never);
  });

  describe("writeSnapshot", () => {
    it("copies the subject's username, since nothing would say who they were once the account is gone", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ username: "ana" } as never);

      await service.writeSnapshot(prisma, reportId, {
        objectS3Key: photoKey,
        contentType: "image/jpeg",
        sizeBytes: 1024,
        subjectUserId: "22222222-2222-2222-2222-222222222222",
      });

      expect(prisma.reportEvidence.create).toHaveBeenCalledWith({
        data: {
          reportId,
          objectS3Key: photoKey,
          contentType: "image/jpeg",
          sizeBytes: 1024,
          subjectUserId: "22222222-2222-2222-2222-222222222222",
          subjectUsername: "ana",
        },
      });
    });

    it("records the subject's avatar as the reported object for a member report", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ username: "ana", avatarS3Key: "avatars/u/a" } as never);

      await service.writeSnapshot(prisma, reportId, {
        subjectUserId: "22222222-2222-2222-2222-222222222222",
        subjectAvatarIsObject: true,
      });

      expect(prisma.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ objectS3Key: "avatars/u/a", subjectUsername: "ana" }) as unknown,
      });
    });

    it("records no object for a member without a profile photo", async () => {
      prisma.userDetails.findUnique.mockResolvedValue({ username: "ana", avatarS3Key: null } as never);

      await service.writeSnapshot(prisma, reportId, {
        subjectUserId: "22222222-2222-2222-2222-222222222222",
        subjectAvatarIsObject: true,
      });

      expect(prisma.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ objectS3Key: null }) as unknown,
      });
    });

    it("writes a snapshot with nothing but the report for a target with no subject or object", async () => {
      await service.writeSnapshot(prisma, reportId, {});

      expect(prisma.userDetails.findUnique).not.toHaveBeenCalled();
      expect(prisma.reportEvidence.create).toHaveBeenCalledWith({
        data: {
          reportId,
          objectS3Key: null,
          contentType: null,
          sizeBytes: null,
          subjectUserId: null,
          subjectUsername: null,
        },
      });
    });
  });

  describe("preserveBeforeDelete", () => {
    it("lets every key go when none is reported, copying nothing", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([]);

      await expect(service.preserveBeforeDelete([photoKey, otherKey])).resolves.toEqual({
        deletable: [photoKey, otherKey],
        retained: [],
      });
      expect(s3Service.copyObject).not.toHaveBeenCalled();
      expect(prisma.reportEvidence.findMany).toHaveBeenCalledWith({
        where: { objectS3Key: { in: [photoKey, otherKey] }, evidenceS3Key: null },
        select: { id: true, reportId: true, objectS3Key: true },
      });
    });

    it("copies a reported object to evidence/{reportId}/, records the copy and its hash, then lets it go", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([{ id: "ev-1", reportId, objectS3Key: photoKey }] as never);

      await expect(service.preserveBeforeDelete([photoKey])).resolves.toEqual({ deletable: [photoKey], retained: [] });

      const evidenceS3Key = `evidence/${reportId}/${photoKey}`;
      expect(s3Service.copyObject).toHaveBeenCalledWith(photoKey, evidenceS3Key);
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
        where: { id: "ev-1" },
        data: {
          evidenceS3Key,
          sha256: "ab".repeat(32),
          quarantinedAt: expect.any(Date) as unknown,
          quarantineFailedAt: null,
        },
      });
    });

    it("makes one copy per report when several reports are about the same object", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([
        { id: "ev-1", reportId, objectS3Key: photoKey },
        { id: "ev-2", reportId: otherReportId, objectS3Key: photoKey },
      ] as never);

      await service.preserveBeforeDelete([photoKey]);

      expect(s3Service.copyObject).toHaveBeenCalledWith(photoKey, `evidence/${reportId}/${photoKey}`);
      expect(s3Service.copyObject).toHaveBeenCalledWith(photoKey, `evidence/${otherReportId}/${photoKey}`);
    });

    it("keeps the original when its copy fails, marks it for the retry and alerts", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([{ id: "ev-1", reportId, objectS3Key: photoKey }] as never);
      s3Service.copyObject.mockRejectedValue(new Error("s3 down"));

      await expect(service.preserveBeforeDelete([photoKey, otherKey])).resolves.toEqual({
        deletable: [otherKey],
        retained: [photoKey],
      });
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
        where: { id: "ev-1" },
        data: { quarantineFailedAt: expect.any(Date) as unknown },
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.evidence.copy_failed", reportId }),
        expect.any(String),
      );
    });

    it("keeps every key when it can't tell which are evidence", async () => {
      prisma.reportEvidence.findMany.mockRejectedValue(new Error("db down"));

      await expect(service.preserveBeforeDelete([photoKey, otherKey])).resolves.toEqual({
        deletable: [],
        retained: [photoKey, otherKey],
      });
    });

    it("asks nothing for an empty delete", async () => {
      await expect(service.preserveBeforeDelete([])).resolves.toEqual({ deletable: [], retained: [] });
      expect(prisma.reportEvidence.findMany).not.toHaveBeenCalled();
    });
  });

  describe("discardImages", () => {
    it("deletes each evidence copy and forgets its objects, keeping the hash", async () => {
      const key = `evidence/${reportId}/${photoKey}`;
      prisma.reportEvidence.findMany.mockResolvedValue([{ id: "ev-1", reportId, evidenceS3Key: key }] as never);

      await service.discardImages([reportId]);

      expect(s3Service.deleteObject).toHaveBeenCalledWith(key);
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
        where: { id: "ev-1" },
        data: { evidenceS3Key: null, objectS3Key: null, quarantineFailedAt: null },
      });
    });

    it("touches only actioned intimate-image reports that aren't held", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([]);

      await service.discardImages([reportId, otherReportId], now);

      expect(prisma.reportEvidence.findMany).toHaveBeenCalledWith({
        where: {
          reportId: { in: [reportId, otherReportId] },
          report: {
            reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
            status: "ACTIONED",
            OR: [{ holdUntil: null }, { holdUntil: { lt: now } }],
          },
        },
        select: { id: true, reportId: true, evidenceS3Key: true },
      });
      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("forgets the original of an image whose copy had failed, so the copy is never retried", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([{ id: "ev-1", reportId, evidenceS3Key: null }] as never);

      await service.discardImages([reportId], now);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
      expect(prisma.reportEvidence.update).toHaveBeenCalledWith({
        where: { id: "ev-1" },
        data: { evidenceS3Key: null, objectS3Key: null, quarantineFailedAt: null },
      });
    });

    it("keeps the row pointing at a copy it could not delete, and alerts", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([
        { id: "ev-1", reportId, evidenceS3Key: `evidence/${reportId}/x` },
      ] as never);
      s3Service.deleteObject.mockRejectedValue(new Error("s3 down"));

      await service.discardImages([reportId]);

      expect(prisma.reportEvidence.update).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("findKeysAwaitingQuarantine", () => {
    it("returns the keys a report's evidence still needs as the original", async () => {
      prisma.reportEvidence.findMany.mockResolvedValue([{ objectS3Key: photoKey }] as never);

      await expect(service.findKeysAwaitingQuarantine([photoKey, otherKey])).resolves.toEqual([photoKey]);
    });
  });

  describe("runEvidenceJob", () => {
    beforeEach(() => {
      prisma.reportEvidence.findMany.mockResolvedValue([]);
      prisma.report.findMany.mockResolvedValue([]);
      prisma.photo.count.mockResolvedValue(0);
      prisma.event.count.mockResolvedValue(0);
      prisma.reportEvidence.count.mockResolvedValue(0);
    });

    it("retries failed copies, then deletes the original once nothing references it", async () => {
      prisma.reportEvidence.findMany.mockResolvedValueOnce([{ id: "ev-1", reportId, objectS3Key: photoKey }] as never);

      const result = await service.runEvidenceJob(now);

      expect(s3Service.copyObject).toHaveBeenCalledWith(photoKey, `evidence/${reportId}/${photoKey}`);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(photoKey);
      expect(result).toMatchObject({ retried: 1, quarantined: 1 });
    });

    it("leaves the original alone after a successful retry while a photo still points at it", async () => {
      prisma.reportEvidence.findMany.mockResolvedValueOnce([{ id: "ev-1", reportId, objectS3Key: photoKey }] as never);
      prisma.photo.count.mockResolvedValue(1);

      await service.runEvidenceJob(now);

      expect(s3Service.deleteObject).not.toHaveBeenCalled();
    });

    it("purges closed reports past the retention window that aren't held, objects first", async () => {
      prisma.report.findMany.mockResolvedValue([
        { id: reportId, evidence: { evidenceS3Key: `evidence/${reportId}/${photoKey}` } },
        { id: otherReportId, evidence: null },
      ] as never);
      s3Service.deleteObjects.mockResolvedValue({ deleted: [`evidence/${reportId}/${photoKey}`], failed: [] });
      prisma.report.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.runEvidenceJob(now);

      const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: "OPEN" },
          resolvedAt: { lt: cutoff },
          OR: [{ holdUntil: null }, { holdUntil: { lt: now } }],
        },
        orderBy: { resolvedAt: "asc" },
        take: 50,
        select: { id: true, evidence: { select: { evidenceS3Key: true } } },
      });
      expect(s3Service.deleteObjects.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.report.deleteMany.mock.invocationCallOrder[0],
      );
      expect(prisma.report.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [reportId, otherReportId] } } });
      expect(result).toMatchObject({ purgedReports: 2, purgedObjects: 1, purgeFailed: 0 });
    });

    it("keeps a report whose evidence object couldn't be deleted, for the next run", async () => {
      const key = `evidence/${reportId}/${photoKey}`;
      prisma.report.findMany.mockResolvedValue([
        { id: reportId, evidence: { evidenceS3Key: key } },
        { id: otherReportId, evidence: null },
      ] as never);
      s3Service.deleteObjects.mockResolvedValue({ deleted: [], failed: [{ key, code: "InternalError" }] });
      prisma.report.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.runEvidenceJob(now);

      expect(prisma.report.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [otherReportId] } } });
      expect(result).toMatchObject({ purgedReports: 1, purgeFailed: 1 });
    });

    it("deletes nothing when nothing is past the window", async () => {
      const result = await service.runEvidenceJob(now);

      expect(s3Service.deleteObjects).not.toHaveBeenCalled();
      expect(prisma.report.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ retried: 0, quarantined: 0, purgedReports: 0, purgedObjects: 0, purgeFailed: 0 });
    });
  });
});
