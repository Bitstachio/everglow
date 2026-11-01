import { Prisma, ReportReason, ReportStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS, ALERT_SEVERITY } from "src/common/logging/alert-events.constants";
import { STALE_REPORT_SAMPLE_SIZE } from "./moderation.constants";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The TAKE IT DOWN Act's removal window for a non-consensual intimate image,
// from the request (47 U.S.C. §223a; docs/moderation.md §7).
export const REMOVAL_DEADLINE_HOURS = 48;

// When the hourly check warns that an intimate-image report is still OPEN:
// 12 hours before the deadline, while there is still time to act.
export const REMOVAL_DUE_SOON_AFTER_HOURS = 36;

// OPEN reports older than this are announced again every this many days, so
// a missed `report.stale` is not the last word (docs/moderation.md §9).
export const OPEN_REPORT_REMINDER_DAYS = 7;

/** When a new report must be acted on by law: 48 hours from filing for an intimate image, otherwise never. */
export const removalDueAtFor = (reason: ReportReason, filedAt: Date): Date | null =>
  reason === ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE
    ? new Date(filedAt.getTime() + REMOVAL_DEADLINE_HOURS * HOUR_MS)
    : null;

/** Whole days from `since` to `now`. */
export const ageInDays = (since: Date, now: Date): number => Math.floor((now.getTime() - since.getTime()) / DAY_MS);

/** The cutoff `days` before `now`. */
export const daysBefore = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);

export interface RemovalDeadlineAlerts {
  /** Intimate-image reports announced this run as 12 hours from their deadline. */
  removalDueSoon: number;
  /** Intimate-image reports announced this run as past their deadline. */
  removalOverdue: number;
}

type DeadlineReport = {
  id: string;
  eventId: string | null;
  reason: ReportReason;
  queue: string;
  removalDueAt: Date | null;
};

const deadlineSelect = { id: true, eventId: true, reason: true, queue: true, removalDueAt: true } as const;

/**
 * The hourly removal-deadline check (docs/moderation.md §7, §9). Each OPEN
 * report with a `removalDueAt` is announced once when 36 hours have passed
 * (`report.removal_due_soon`) and once more when the deadline has
 * (`report.removal_overdue`). Both page. One line per report, naming the
 * report and never a person.
 */
export const alertRemovalDeadlines = async (
  db: Prisma.TransactionClient,
  logger: PinoLogger,
  now: Date,
): Promise<RemovalDeadlineAlerts> => {
  const soonBy = new Date(now.getTime() + (REMOVAL_DEADLINE_HOURS - REMOVAL_DUE_SOON_AFTER_HOURS) * HOUR_MS);

  const dueSoon: DeadlineReport[] = await db.report.findMany({
    where: { status: ReportStatus.OPEN, removalDueAt: { gt: now, lte: soonBy }, removalDueSoonAlertedAt: null },
    orderBy: { removalDueAt: "asc" },
    select: deadlineSelect,
  });
  for (const report of dueSoon) {
    logger.warn(
      {
        event: ALERT_EVENTS.REPORT_REMOVAL_DUE_SOON,
        ...deadlineFields(report),
        hoursLeft: Math.max(0, Math.floor((report.removalDueAt!.getTime() - now.getTime()) / HOUR_MS)),
      },
      "An intimate-image report is close to its 48-hour removal deadline",
    );
  }
  if (dueSoon.length > 0) {
    await db.report.updateMany({
      where: { id: { in: dueSoon.map((report) => report.id) }, removalDueSoonAlertedAt: null },
      data: { removalDueSoonAlertedAt: now },
    });
  }

  const overdue: DeadlineReport[] = await db.report.findMany({
    where: { status: ReportStatus.OPEN, removalDueAt: { lte: now }, removalOverdueAlertedAt: null },
    orderBy: { removalDueAt: "asc" },
    select: deadlineSelect,
  });
  for (const report of overdue) {
    logger.warn(
      {
        event: ALERT_EVENTS.REPORT_REMOVAL_OVERDUE,
        ...deadlineFields(report),
        hoursOverdue: Math.floor((now.getTime() - report.removalDueAt!.getTime()) / HOUR_MS),
      },
      "An intimate-image report is past its 48-hour removal deadline",
    );
  }
  if (overdue.length > 0) {
    await db.report.updateMany({
      where: { id: { in: overdue.map((report) => report.id) }, removalOverdueAlertedAt: null },
      data: { removalOverdueAlertedAt: now },
    });
  }

  return { removalDueSoon: dueSoon.length, removalOverdue: overdue.length };
};

const deadlineFields = (report: DeadlineReport) => ({
  reportId: report.id,
  eventId: report.eventId,
  reason: report.reason,
  queue: report.queue,
  removalDueAt: report.removalDueAt,
  severity: ALERT_SEVERITY.PAGE,
});

/**
 * The weekly reminder (docs/moderation.md §9): OPEN reports filed more than
 * OPEN_REPORT_REMINDER_DAYS ago whose last overdue alert is at least that
 * old are announced again, in one `report.stale` line with `reminder: true`
 * and the oldest one's `ageDays`. Their `overdueAlertedAt` moves to now, so
 * each comes round once a week until someone closes it. Returns how many.
 */
export const remindLongOpenReports = async (
  db: Prisma.TransactionClient,
  logger: PinoLogger,
  now: Date,
): Promise<number> => {
  const cutoff = daysBefore(now, OPEN_REPORT_REMINDER_DAYS);
  const due = { status: ReportStatus.OPEN, createdAt: { lt: cutoff }, overdueAlertedAt: { lt: cutoff } };

  const [count, oldest] = await Promise.all([
    db.report.count({ where: due }),
    db.report.findMany({
      where: due,
      orderBy: { createdAt: "asc" },
      take: STALE_REPORT_SAMPLE_SIZE,
      select: { id: true, eventId: true, createdAt: true },
    }),
  ]);
  if (count === 0) return 0;

  logger.warn(
    {
      event: ALERT_EVENTS.REPORT_STALE,
      reminder: true,
      stale: count,
      remindAfterDays: OPEN_REPORT_REMINDER_DAYS,
      ageDays: oldest[0] ? ageInDays(oldest[0].createdAt, now) : null,
      reportIds: oldest.map((report) => report.id),
      eventIds: [...new Set(oldest.flatMap((report) => (report.eventId ? [report.eventId] : [])))],
      severity: ALERT_SEVERITY.TICKET,
    },
    "Reports are still open a week or more after they were filed",
  );
  await db.report.updateMany({ where: due, data: { overdueAlertedAt: now } });

  return count;
};
