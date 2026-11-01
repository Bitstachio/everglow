import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import {
  REMOVAL_DEADLINE_HOURS,
  ageInDays,
  alertRemovalDeadlines,
  remindLongOpenReports,
  removalDueAtFor,
} from "./report-deadlines";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("report deadlines", () => {
  const eventId = "66666666-6666-6666-6666-666666666666";
  const filedAt = new Date("2026-06-10T12:00:00.000Z");
  const dueAt = new Date(filedAt.getTime() + REMOVAL_DEADLINE_HOURS * HOUR_MS);
  const at = (hoursAfterFiling: number) => new Date(filedAt.getTime() + hoursAfterFiling * HOUR_MS);

  let prisma: DeepMockProxy<PrismaClient>;
  let logger: { warn: jest.Mock; info: jest.Mock };

  const ncii = {
    id: "r-ncii",
    eventId,
    reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
    queue: "PLATFORM",
    removalDueAt: dueAt,
  };

  // The database as the check sees it at `now`: one OPEN intimate-image
  // report filed at `filedAt`, with whichever alerts already went out.
  const reportAt = (now: Date, alerted: { soon?: boolean; overdue?: boolean } = {}) => {
    prisma.report.findMany.mockImplementation(((args: {
      where: { removalDueAt: { gt?: Date; lte: Date }; removalDueSoonAlertedAt?: null; removalOverdueAlertedAt?: null };
    }) => {
      const { removalDueAt } = args.where;
      const inWindow = (!removalDueAt.gt || dueAt > removalDueAt.gt) && dueAt <= removalDueAt.lte;
      const soonQuery = "removalDueSoonAlertedAt" in args.where;
      const alreadyAlerted = soonQuery ? alerted.soon : alerted.overdue;
      return Promise.resolve(inWindow && !alreadyAlerted ? [ncii] : []);
    }) as never);
    return now;
  };

  const run = (now: Date) => alertRemovalDeadlines(prisma, logger as unknown as PinoLogger, now);

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    logger = { warn: jest.fn(), info: jest.fn() };
  });

  describe("removalDueAtFor", () => {
    it("gives an intimate-image report 48 hours from filing, and any other none", () => {
      expect(removalDueAtFor("NON_CONSENSUAL_INTIMATE_IMAGE", filedAt)).toEqual(dueAt);
      expect(removalDueAtFor("CHILD_SAFETY", filedAt)).toBeNull();
      expect(removalDueAtFor("SPAM", filedAt)).toBeNull();
    });
  });

  describe("alertRemovalDeadlines", () => {
    it("says nothing in the first 36 hours", async () => {
      await expect(run(reportAt(at(35)))).resolves.toEqual({ removalDueSoon: 0, removalOverdue: 0 });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("pages once at 36 hours, naming the report and no person, and marks it", async () => {
      const now = reportAt(at(36));

      await expect(run(now)).resolves.toEqual({ removalDueSoon: 1, removalOverdue: 0 });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        {
          event: "report.removal_due_soon",
          reportId: "r-ncii",
          eventId,
          reason: "NON_CONSENSUAL_INTIMATE_IMAGE",
          queue: "PLATFORM",
          removalDueAt: dueAt,
          severity: "page",
          hoursLeft: 12,
        },
        expect.any(String),
      );
      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["r-ncii"] }, removalDueSoonAlertedAt: null },
        data: { removalDueSoonAlertedAt: now },
      });
    });

    it("does not repeat the warning on the next hourly run", async () => {
      await expect(run(reportAt(at(37), { soon: true }))).resolves.toEqual({ removalDueSoon: 0, removalOverdue: 0 });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("pages once more at 48 hours, and never again", async () => {
      const now = reportAt(at(48), { soon: true });

      await expect(run(now)).resolves.toEqual({ removalDueSoon: 0, removalOverdue: 1 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "report.removal_overdue",
          reportId: "r-ncii",
          severity: "page",
          hoursOverdue: 0,
        }),
        expect.any(String),
      );
      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["r-ncii"] }, removalOverdueAlertedAt: null },
        data: { removalOverdueAlertedAt: now },
      });

      logger.warn.mockClear();
      await expect(run(reportAt(at(49), { soon: true, overdue: true }))).resolves.toEqual({
        removalDueSoon: 0,
        removalOverdue: 0,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("asks only about OPEN reports", async () => {
      await run(reportAt(at(36)));

      for (const [args] of prisma.report.findMany.mock.calls) {
        expect(args).toMatchObject({ where: { status: "OPEN" } });
      }
    });
  });

  describe("remindLongOpenReports", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    const due = { status: "OPEN", createdAt: { lt: cutoff }, overdueAlertedAt: { lt: cutoff } };
    const remind = () => remindLongOpenReports(prisma, logger as unknown as PinoLogger, now);

    it("announces OPEN reports over a week old, last announced a week ago or more, in one line", async () => {
      prisma.report.count.mockResolvedValue(3);
      prisma.report.findMany.mockResolvedValue([
        { id: "r-1", eventId, createdAt: new Date("2026-06-01T12:00:00.000Z") },
        { id: "r-2", eventId: null, createdAt: new Date("2026-06-05T12:00:00.000Z") },
      ] as never);

      await expect(remind()).resolves.toBe(3);

      expect(prisma.report.count).toHaveBeenCalledWith({ where: due });
      expect(logger.warn).toHaveBeenCalledWith(
        {
          event: "report.stale",
          reminder: true,
          stale: 3,
          remindAfterDays: 7,
          ageDays: 19,
          reportIds: ["r-1", "r-2"],
          eventIds: [eventId],
          severity: "ticket",
        },
        expect.any(String),
      );
      // Marked now, so each comes round again a week later, not every hour.
      expect(prisma.report.updateMany).toHaveBeenCalledWith({ where: due, data: { overdueAlertedAt: now } });
    });

    it("says nothing when no report is due a reminder", async () => {
      prisma.report.count.mockResolvedValue(0);
      prisma.report.findMany.mockResolvedValue([]);

      await expect(remind()).resolves.toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(prisma.report.updateMany).not.toHaveBeenCalled();
    });
  });

  it("counts age in whole days", () => {
    expect(ageInDays(filedAt, new Date(filedAt.getTime() + 7 * DAY_MS - 1))).toBe(6);
    expect(ageInDays(filedAt, new Date(filedAt.getTime() + 7 * DAY_MS))).toBe(7);
  });
});
