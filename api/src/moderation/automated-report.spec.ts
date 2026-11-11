import { PrismaClient, Report } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AutomatedReportInput, fileAutomatedReport, logAutomatedReport } from "./automated-report";
import { EvidenceService } from "./evidence/evidence.service";
import { buildEvidenceServiceMock, EvidenceServiceMock } from "./evidence/testing/evidence-service.mock";

describe("automated reports", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const uploaderId = "22222222-2222-2222-2222-222222222222";
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  let tx: DeepMockProxy<PrismaClient>;
  let evidence: EvidenceServiceMock;

  const input = (overrides: Partial<AutomatedReportInput> = {}): AutomatedReportInput => ({
    eventId,
    eventTitle: "Sam & Jo",
    targetType: "PHOTO",
    photoId,
    reportedUserId: uploaderId,
    reason: "NUDITY_OR_SEXUAL",
    note: "Upload screening: Explicit Nudity (97%)",
    snapshot: {
      objectS3Key: `photos/${eventId}/${photoId}`,
      contentType: "image/jpeg",
      sizeBytes: 1024,
      subjectUserId: uploaderId,
    },
    ...overrides,
  });

  const created = (overrides: Partial<Report> = {}) => ({ id: reportId, eventId, photoId, ...overrides }) as Report;

  const file = (overrides: Partial<AutomatedReportInput> = {}) =>
    fileAutomatedReport(tx as never, evidence as unknown as EvidenceService, input(overrides), now);

  const insertedData = () => (tx.report.createManyAndReturn.mock.calls[0][0]!.data as Record<string, unknown>[])[0];

  beforeEach(() => {
    tx = mockDeep<PrismaClient>();
    tx.report.createManyAndReturn.mockResolvedValue([created()]);
    evidence = buildEvidenceServiceMock();
  });

  it("files it with no reporter, as AUTOMATED, straight into the platform's queue, with its snapshot", async () => {
    await expect(file()).resolves.toEqual(created());

    expect(tx.report.createManyAndReturn).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          eventId,
          eventTitle: "Sam & Jo",
          reporterId: null,
          source: "AUTOMATED",
          targetType: "PHOTO",
          photoId,
          reportedUserId: uploaderId,
          reason: "NUDITY_OR_SEXUAL",
          note: "Upload screening: Explicit Nudity (97%)",
          queue: "PLATFORM",
          escalatedAt: now,
          escalationReasons: ["AUTOMATED_FLAG", "SEVERE_REASON"],
          removalDueAt: null,
        },
      ],
    });
    expect(evidence.writeSnapshot).toHaveBeenCalledWith(tx, reportId, input().snapshot);
  });

  it("files nothing, and writes no snapshot, while the photo already has an OPEN automated report", async () => {
    tx.report.createManyAndReturn.mockResolvedValue([]);

    await expect(file()).resolves.toBeNull();
    expect(evidence.writeSnapshot).not.toHaveBeenCalled();
  });

  it("takes the reason the caller gives: a non-severe one escalates for being automated only", async () => {
    await file({ reason: "HARASSMENT" });

    expect(insertedData()).toMatchObject({ reason: "HARASSMENT", escalationReasons: ["AUTOMATED_FLAG"] });
  });

  it("holds a child-safety report from the start and pages for it, like a member's", async () => {
    await file({ reason: "CHILD_SAFETY" });

    expect(insertedData()).toMatchObject({
      escalationReasons: ["AUTOMATED_FLAG", "SEVERE_REASON", "CHILD_SAFETY"],
      holdUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      holdReason: "CHILD_SAFETY",
    });
  });

  it("gives an intimate-image report its 48-hour removal deadline", async () => {
    await file({ reason: "NON_CONSENSUAL_INTIMATE_IMAGE" });

    expect(insertedData()).toMatchObject({ removalDueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000) });
  });

  it("files a MEMBER report without a photo, whatever photoId it was given", async () => {
    await file({ targetType: "MEMBER", photoId, reason: "CHILD_SAFETY", note: null });

    expect(insertedData()).toMatchObject({ targetType: "MEMBER", photoId: null, note: null });
  });

  it("keeps the note within the column and stores an empty one as null", async () => {
    await file({ note: "x".repeat(600) });
    expect((insertedData().note as string).length).toBe(500);

    tx.report.createManyAndReturn.mockClear();
    await file({ note: "" });
    expect(insertedData().note).toBeNull();
  });

  it("logs the audit line without a caller, then the platform's alert without identities or the note", () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    const report = {
      id: reportId,
      eventId,
      source: "AUTOMATED",
      targetType: "PHOTO",
      photoId,
      reportedUserId: uploaderId,
      reason: "VIOLENCE",
      queue: "PLATFORM",
      note: "Upload screening: Graphic Violence (91%)",
      escalationReasons: ["AUTOMATED_FLAG", "SEVERE_REASON"],
    } as Report;

    logAutomatedReport(logger as unknown as PinoLogger, report, { check: "upload_screening" });

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: "report.created",
        reportId,
        eventId,
        source: "AUTOMATED",
        targetType: "PHOTO",
        photoId,
        reportedUserId: uploaderId,
        reason: "VIOLENCE",
        queue: "PLATFORM",
        check: "upload_screening",
        audit: true,
      },
      expect.any(String),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      {
        event: "report.escalated",
        reportId,
        eventId,
        reason: "VIOLENCE",
        queue: "PLATFORM",
        escalationReasons: ["automated_flag", "severe_reason"],
        severity: "ticket",
      },
      expect.any(String),
    );
    expect(JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls])).not.toContain("Graphic Violence");
  });
});
