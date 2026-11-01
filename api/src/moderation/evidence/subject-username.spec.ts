import { ConfigService } from "@nestjs/config";
import { PrismaClient, ReportHoldReason } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "./evidence.service";
import { holdKeepsSubjectUsername, subjectUsernameScrubbable } from "./subject-username";

// Kept apart from evidence.service.spec.ts: EV-200 adds this one method to the
// evidence job, and its tests travel with the retention rule they check.
describe("EvidenceService.scrubDeletedSubjectUsernames", () => {
  const now = new Date("2027-10-06T04:00:00.000Z");
  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let service: EvidenceService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const config = {
      getOrThrow: jest.fn(
        (key: string) => ({ "moderation.evidenceJobBatchSize": 50, "moderation.reportRetentionDays": 365 })[key],
      ),
    };
    service = new EvidenceService(
      prisma as unknown as PrismaService,
      { deleteObjects: jest.fn() } as unknown as S3Service,
      config as unknown as ConfigService,
      logger as unknown as PinoLogger,
    );
    prisma.reportEvidence.findMany.mockResolvedValue([]);
    prisma.report.findMany.mockResolvedValue([]);
  });

  it("nulls the username on evidence about deleted accounts, except under a running child-safety or law-enforcement hold", async () => {
    prisma.$executeRaw.mockResolvedValue(2);

    await expect(service.scrubDeletedSubjectUsernames(now)).resolves.toBe(2);

    const [strings, reasons, at] = prisma.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?");
    expect(sql).toContain(`SET "subjectUsername" = NULL`);
    expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM "User" AS u WHERE u."id" = e."subjectUserId")`);
    expect(reasons).toEqual([ReportHoldReason.CHILD_SAFETY, ReportHoldReason.LAW_ENFORCEMENT]);
    expect(at).toEqual(now);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report.evidence.subject_username_scrubbed", scrubbed: 2 }),
      expect.any(String),
    );
  });

  it("logs nothing when there was nothing to scrub", async () => {
    prisma.$executeRaw.mockResolvedValue(0);

    await service.scrubDeletedSubjectUsernames(now);

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("runs as part of the daily evidence job", async () => {
    prisma.$executeRaw.mockResolvedValue(0);

    await service.runEvidenceJob(now);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("subject username retention", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const later = new Date("2026-09-10T12:00:00.000Z");
  const earlier = new Date("2026-03-10T12:00:00.000Z");

  describe("holdKeepsSubjectUsername", () => {
    it.each([ReportHoldReason.CHILD_SAFETY, ReportHoldReason.LAW_ENFORCEMENT])(
      "keeps it while a %s hold is running",
      (holdReason) => {
        expect(holdKeepsSubjectUsername({ holdReason, holdUntil: later }, now)).toBe(true);
      },
    );

    it("lets it go once that hold has ended", () => {
      expect(holdKeepsSubjectUsername({ holdReason: ReportHoldReason.CHILD_SAFETY, holdUntil: earlier }, now)).toBe(
        false,
      );
      expect(holdKeepsSubjectUsername({ holdReason: ReportHoldReason.CHILD_SAFETY, holdUntil: now }, now)).toBe(false);
    });

    it.each([ReportHoldReason.INTIMATE_IMAGE, ReportHoldReason.LEGAL])(
      "lets it go under a %s hold, which needs the content but not the name",
      (holdReason) => {
        expect(holdKeepsSubjectUsername({ holdReason, holdUntil: later }, now)).toBe(false);
      },
    );

    it("lets it go with no hold", () => {
      expect(holdKeepsSubjectUsername({ holdReason: null, holdUntil: null }, now)).toBe(false);
    });
  });

  it("matches the null columns explicitly in the Prisma filter", () => {
    expect(subjectUsernameScrubbable(now)).toEqual({
      OR: [
        { holdReason: null },
        { holdReason: { notIn: [ReportHoldReason.CHILD_SAFETY, ReportHoldReason.LAW_ENFORCEMENT] } },
        { holdUntil: null },
        { holdUntil: { lte: now } },
      ],
    });
  });
});
