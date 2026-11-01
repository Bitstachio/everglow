import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { Readable } from "node:stream";
import { EvidenceService } from "../evidence/evidence.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "../evidence/testing/evidence-service.mock";
import { PlatformModerationService } from "./platform-moderation.service";

describe("PlatformModerationService", () => {
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const moderatorId = "99999999-9999-9999-9999-999999999999";
  const DAY_MS = 24 * 60 * 60 * 1000;

  let prisma: DeepMockProxy<PrismaClient>;
  let s3Service: { getObjectStream: jest.Mock };
  let evidenceService: EvidenceServiceMock;
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock };
  let service: PlatformModerationService;

  const report = (overrides: Record<string, unknown> = {}) => ({
    id: reportId,
    eventId,
    reason: "SPAM",
    status: "OPEN",
    holdUntil: null,
    authorityReportedAt: null,
    evidence: { objectS3Key: "photos/u/e/p", evidenceS3Key: null },
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    s3Service = { getObjectStream: jest.fn() };
    evidenceService = buildEvidenceServiceMock();
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
    service = new PlatformModerationService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      evidenceService as unknown as EvidenceService,
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

  describe("openEvidence", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const body = Readable.from([Buffer.from("jpeg")]);

    beforeEach(() => {
      s3Service.getObjectStream.mockResolvedValue({ body, contentType: "image/jpeg", contentLength: 4 });
    });

    it("streams the evidence copy once there is one, and logs every look with the moderator", async () => {
      prisma.report.findUnique.mockResolvedValue(
        report({ evidence: { objectS3Key: null, evidenceS3Key: `evidence/${reportId}/photos/u/e/p` } }) as never,
      );

      await expect(service.openEvidence(reportId, moderatorId, now)).resolves.toEqual({
        body,
        contentType: "image/jpeg",
        contentLength: 4,
      });
      expect(s3Service.getObjectStream).toHaveBeenCalledWith(`evidence/${reportId}/photos/u/e/p`);
      expect(logger.warn).toHaveBeenCalledWith(
        {
          event: "report.evidence.viewed",
          reportId,
          eventId,
          moderatorId,
          reason: "SPAM",
          status: "OPEN",
          quarantined: true,
          severity: "ticket",
          audit: true,
        },
        expect.any(String),
      );
    });

    it("streams the live object while there is no copy yet", async () => {
      prisma.report.findUnique.mockResolvedValue(report() as never);

      await service.openEvidence(reportId, moderatorId, now);

      expect(s3Service.getObjectStream).toHaveBeenCalledWith("photos/u/e/p");
    });

    it("pages when the report is about child safety", async () => {
      prisma.report.findUnique.mockResolvedValue(report({ reason: "CHILD_SAFETY" }) as never);

      await service.openEvidence(reportId, moderatorId, now);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.evidence.viewed", severity: "page" }),
        expect.any(String),
      );
    });

    it("refuses a closed report that isn't held with 403 EVIDENCE_REPORT_CLOSED, reading nothing", async () => {
      prisma.report.findUnique.mockResolvedValue(
        report({ status: "ACTIONED", holdUntil: new Date(now.getTime() - DAY_MS) }) as never,
      );

      await expect(service.openEvidence(reportId, moderatorId, now)).rejects.toMatchObject({
        response: { code: "EVIDENCE_REPORT_CLOSED" },
      });
      expect(s3Service.getObjectStream).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("opens a closed report while it is held", async () => {
      prisma.report.findUnique.mockResolvedValue(
        report({ status: "ACTIONED", holdUntil: new Date(now.getTime() + DAY_MS) }) as never,
      );

      await expect(service.openEvidence(reportId, moderatorId, now)).resolves.toMatchObject({ body });
    });

    it("answers 404 EVIDENCE_NOT_AVAILABLE when the report has no object", async () => {
      prisma.report.findUnique.mockResolvedValue(report({ evidence: null }) as never);

      await expect(service.openEvidence(reportId, moderatorId, now)).rejects.toMatchObject({
        response: { code: "EVIDENCE_NOT_AVAILABLE" },
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("answers 404 EVIDENCE_NOT_AVAILABLE when the object is gone from S3, logging no look", async () => {
      prisma.report.findUnique.mockResolvedValue(report() as never);
      s3Service.getObjectStream.mockResolvedValue(null);

      await expect(service.openEvidence(reportId, moderatorId, now)).rejects.toMatchObject({
        response: { code: "EVIDENCE_NOT_AVAILABLE" },
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("answers 404 for a report that doesn't exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.openEvidence(reportId, moderatorId, now)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("holds", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");

    beforeEach(() => {
      prisma.report.findUnique.mockResolvedValue(report() as never);
      prisma.report.update.mockResolvedValue(report() as never);
    });

    it("sets and releases a hold, logging both", async () => {
      const until = new Date("2028-01-01T00:00:00.000Z");

      await service.setHold(reportId, moderatorId, until, "LEGAL", now);
      await service.releaseHold(reportId, moderatorId, now);

      expect(prisma.report.update).toHaveBeenNthCalledWith(1, {
        where: { id: reportId },
        data: { holdUntil: until, holdReason: "LEGAL" },
        include: { evidence: true },
      });
      expect(prisma.report.update).toHaveBeenNthCalledWith(2, {
        where: { id: reportId },
        data: { holdUntil: null, holdReason: null },
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: "report.hold.released", reportId, moderatorId, keptUntil: null }),
        expect.any(String),
      );
    });

    it.each([
      ["in the past", new Date(now.getTime() - DAY_MS)],
      ["now", now],
      ["more than 3 years away", new Date("2029-11-02T12:00:00.000Z")],
    ])("refuses a hold %s with 400, changing nothing", async (_, until) => {
      await expect(service.setHold(reportId, moderatorId, until, "LEGAL", now)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it("accepts a hold exactly 3 years away", async () => {
      const until = new Date("2029-11-01T12:00:00.000Z");

      await service.setHold(reportId, moderatorId, until, "LEGAL", now);

      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { holdUntil: until, holdReason: "LEGAL" } }),
      );
    });

    it("never holds a report sent to the authorities for less than a year from the submission", async () => {
      const authorityReportedAt = new Date("2026-10-01T00:00:00.000Z");
      prisma.report.findUnique.mockResolvedValue(report({ authorityReportedAt }) as never);

      await service.setHold(reportId, moderatorId, new Date("2026-12-01T00:00:00.000Z"), "LAW_ENFORCEMENT", now);

      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { holdUntil: new Date(authorityReportedAt.getTime() + 365 * DAY_MS), holdReason: "LAW_ENFORCEMENT" },
        }),
      );
    });

    it("releases a report sent to the authorities down to its preservation date, and discards nothing", async () => {
      const authorityReportedAt = new Date("2026-10-01T00:00:00.000Z");
      const preservedUntil = new Date(authorityReportedAt.getTime() + 365 * DAY_MS);
      prisma.report.findUnique.mockResolvedValue(
        report({ authorityReportedAt, holdUntil: new Date("2028-01-01T00:00:00.000Z") }) as never,
      );

      await service.releaseHold(reportId, moderatorId, now);

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: reportId },
        data: { holdUntil: preservedUntil },
      });
      expect(evidenceService.discardImages).not.toHaveBeenCalled();
    });

    it("discards an actioned intimate image's evidence copy as soon as its hold is released", async () => {
      await service.releaseHold(reportId, moderatorId, now);

      // discardImages itself keeps everything but actioned intimate-image reports.
      expect(evidenceService.discardImages).toHaveBeenCalledWith([reportId], now);
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
          authorityReportedAt: submittedAt,
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
          data: {
            authorityReference: "PD-9",
            authorityReportedAt: submittedAt,
            holdUntil: later,
            holdReason: "LAW_ENFORCEMENT",
          },
        }),
      );
    });

    it("extends a shorter hold to a year from the submission: max(existing, submission + 365 days)", async () => {
      const shorter = new Date(submittedAt.getTime() + 30 * DAY_MS);
      prisma.report.findUnique.mockResolvedValue(report({ reason: "CHILD_SAFETY", holdUntil: shorter }) as never);
      prisma.report.update.mockResolvedValue(report() as never);

      await service.recordAuthorityReport(reportId, moderatorId, "CT-7", submittedAt);

      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ holdUntil: new Date(submittedAt.getTime() + 365 * DAY_MS) }) as unknown,
        }),
      );
    });

    it("refuses a submission date in the future with 400, changing nothing", async () => {
      const tomorrow = new Date(Date.now() + DAY_MS);

      await expect(service.recordAuthorityReport(reportId, moderatorId, "CT-8", tomorrow)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.report.update).not.toHaveBeenCalled();
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
