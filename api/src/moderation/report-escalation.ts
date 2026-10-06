import { Prisma, ReportEscalation, ReportReason, ReportTargetType } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";

/** A report that just moved to the platform's queue, as `report.escalated` logs it. */
export interface EscalatedReport {
  id: string;
  eventId: string | null;
  targetType: ReportTargetType;
  photoId: string | null;
  reportedUserId: string | null;
  reason: ReportReason;
}

/**
 * The reasons that put a report in the platform's queue (docs/moderation.md
 * §3). The others (a severe reason, the hide threshold, the event going under
 * review) only alert: the report stays with the organizers.
 */
export const PLATFORM_ESCALATIONS: readonly ReportEscalation[] = [
  ReportEscalation.TARGET_IS_ORGANIZER,
  ReportEscalation.TARGET_IS_EVENT,
  ReportEscalation.GALLERY_CLOSED,
  ReportEscalation.ORGANIZER_TIMEOUT,
  ReportEscalation.SEVERE_DISMISSED,
  ReportEscalation.TARGET_DELETED,
  ReportEscalation.CHILD_SAFETY,
  ReportEscalation.INTIMATE_IMAGE,
];

/** The name a reason is logged under: the `escalationReasons` values alert rules match (docs/alerting.md). */
export const escalationLogName = (reason: ReportEscalation): string => reason.toLowerCase();

/**
 * Moves OPEN reports from the organizers' queue to the platform's, recording
 * why and when. Reports already with the platform, or no longer OPEN, are left
 * alone, so a move is never repeated and never reopens anything. Returns the
 * reports it moved, for the caller to log once its transaction has committed
 * (logEscalations). The columns are timestamps without a time zone holding
 * UTC, as Prisma writes them, so the time is taken in UTC whatever the
 * database session's zone.
 */
export const escalateToPlatform = async (
  db: Prisma.TransactionClient,
  reportIds: string[],
  reason: ReportEscalation,
): Promise<EscalatedReport[]> => {
  if (reportIds.length === 0) return [];

  return db.$queryRaw<EscalatedReport[]>`
    UPDATE "Report"
    SET "queue" = 'PLATFORM', "escalatedAt" = (now() AT TIME ZONE 'UTC'), "updatedAt" = (now() AT TIME ZONE 'UTC'),
        "escalationReasons" = array_append("escalationReasons", ${reason}::"ReportEscalation")
    WHERE "id" = ANY(${reportIds}::uuid[]) AND "status" = 'OPEN' AND "queue" = 'ORGANIZERS'
    RETURNING "id", "eventId", "targetType", "photoId", "reportedUserId", "reason"`;
};

/** One `report.escalated` line per moved report: the platform's alert (docs/moderation.md §9). */
export const logEscalations = (
  logger: PinoLogger,
  reports: EscalatedReport[],
  reason: ReportEscalation,
  context: Record<string, unknown> = {},
): void => {
  for (const report of reports) {
    logger.warn(
      {
        event: ALERT_EVENTS.REPORT_ESCALATED,
        reportId: report.id,
        eventId: report.eventId,
        targetType: report.targetType,
        photoId: report.photoId,
        reportedUserId: report.reportedUserId,
        reason: report.reason,
        escalationReasons: [escalationLogName(reason)],
        ...context,
        audit: true,
      },
      "Report moved to the platform",
    );
  }
};
