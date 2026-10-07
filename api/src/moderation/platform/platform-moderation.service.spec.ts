import { NotFoundException } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EVIDENCE_URL_TTL_SECONDS, PlatformModerationService } from "./platform-moderation.service";

describe("PlatformModerationService", () => {
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const moderatorId = "99999999-9999-9999-9999-999999999999";
  const DAY_MS = 24 * 60 * 60 * 1000;

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { getPresignedDownloadUrl: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock };
  let service: PlatformModerationService;

  const report = (overrides: Record<string, unknown> = {}) => ({
    id: reportId,
    reason: "SPAM",
    holdUntil: null,
    evidence: { objectS3Key: "photos/u/e/p", evidenceS3Key: null },
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    s3Service = { getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://s3.example/get?sig=1") };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
    service = new PlatformModerationService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      logger as unknown as PinoLogger,
    );
  });

  describe("listReports", () => {
    it("lists the platform's OPEN reports, oldest first, with their evidence", async () => {
      prisma.report.findMany.mockResolvedValue([]);

      await service.listReports({});

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { AND: [{ queue: "PLATFORM", status: "OPEN" }] },
        include: { evidence: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 51,
      });
    });

    it("filters by queue, status and event when asked", async () => {
      prisma.report.findMany.mockResolvedValue([]);

      await service.listReports({ queue: "ORGANIZERS", status: "DISMISSED", eventId, limit: 5 });

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ queue: "ORGANIZERS", status: "DISMISSED", eventId }] },
          take: 6,
        }),
      );
    });
  });

  describe("evidenceUrl", () => {
    it("links to the evidence copy once there is one, and logs every look", async () => {
      prisma.report.findUnique.mockResolvedValue(
        report({ evidence: { objectS3Key: null, evidenceS3Key: `evidence/${reportId}/photos/u/e/p` } }) as never,
      );

      await expect(service.evidenceUrl(reportId, moderatorId)).resolves.toMatchObject({
        url: "https://s3.example/get?sig=1",
      });
      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith({
        key: `evidence/${reportId}/photos/u/e/p`,
        expiresInSeconds: EVIDENCE_URL_TTL_SECONDS,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.evidence.viewed", reportId, moderatorId, audit: true }),
        expect.any(String),
      );
    });

    it("links to the live object while there is no copy yet", async () => {
      prisma.report.findUnique.mockResolvedValue(report() as never);

      await service.evidenceUrl(reportId, moderatorId);

      expect(s3Service.getPresignedDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: "photos/u/e/p" }));
    });

    it("answers 404 EVIDENCE_NOT_AVAILABLE when the report has no object", async () => {
      prisma.report.findUnique.mockResolvedValue(report({ evidence: null }) as never);

      await expect(service.evidenceUrl(reportId, moderatorId)).rejects.toMatchObject({
        response: { code: "EVIDENCE_NOT_AVAILABLE" },
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("answers 404 for a report that doesn't exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.evidenceUrl(reportId, moderatorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("holds", () => {
    it("sets and releases a hold, logging both", async () => {
      prisma.report.findUnique.mockResolvedValue(report() as never);
      prisma.report.update.mockResolvedValue(report() as never);
      const until = new Date("2028-01-01T00:00:00.000Z");

      await service.setHold(reportId, moderatorId, until, "LEGAL");
      await service.releaseHold(reportId, moderatorId);

      expect(prisma.report.update).toHaveBeenNthCalledWith(1, {
        where: { id: reportId },
        data: { holdUntil: until, holdReason: "LEGAL" },
        include: { evidence: true },
      });
      expect(prisma.report.update).toHaveBeenNthCalledWith(2, {
        where: { id: reportId },
        data: { holdUntil: null, holdReason: null },
        include: { evidence: true },
      });
    });
  });

  describe("recordAuthorityReport", () => {
    const submittedAt = new Date("2026-10-06T00:00:00.000Z");

    it("stores the reference and holds a child-safety report a year from the submission", async () => {
      prisma.report.findUnique.mockResolvedValue(report({ reason: "CHILD_SAFETY" }) as never);
      prisma.report.update.mockResolvedValue(report() as never);

      await service.recordAuthorityReport(reportId, moderatorId, "CT-123", submittedAt);

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: reportId },
        data: {
          authorityReference: "CT-123",
          holdUntil: new Date(submittedAt.getTime() + 365 * DAY_MS),
          holdReason: "CHILD_SAFETY",
        },
        include: { evidence: true },
      });
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain("CT-123");
    });

    it("keeps a longer hold, and records any other reason as law enforcement", async () => {
      const later = new Date("2030-01-01T00:00:00.000Z");
      prisma.report.findUnique.mockResolvedValue(report({ reason: "HARASSMENT", holdUntil: later }) as never);
      prisma.report.update.mockResolvedValue(report() as never);

      await service.recordAuthorityReport(reportId, moderatorId, "PD-9", submittedAt);

      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { authorityReference: "PD-9", holdUntil: later, holdReason: "LAW_ENFORCEMENT" },
        }),
      );
    });
  });

  describe("liftReview", () => {
    it("clears the review and logs it", async () => {
      prisma.event.findUnique.mockResolvedValue({ underReviewAt: new Date() } as never);

      await service.liftReview(eventId, moderatorId);

      expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { underReviewAt: null } });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "event.review.lifted", eventId, moderatorId }),
        expect.any(String),
      );
    });

    it("is idempotent for an event not under review", async () => {
      prisma.event.findUnique.mockResolvedValue({ underReviewAt: null } as never);

      await service.liftReview(eventId, moderatorId);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("answers 404 for an event that doesn't exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.liftReview(eventId, moderatorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
