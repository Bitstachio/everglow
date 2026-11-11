import {
  Prisma,
  Report,
  ReportEscalation,
  ReportQueue,
  ReportReason,
  ReportSource,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { EvidenceService, EvidenceSnapshot } from "./evidence/evidence.service";
import { initialHoldFor, removalDueAtFor } from "./report-deadlines";
import { escalationAlertFields, escalationLogName, reasonEscalations } from "./report-escalation";

/**
 * What one of the platform's own checks found, as a report (docs/moderation.md
 * §1, §11). The caller decides the reason, the target and the note; this
 * files it the same way whichever check it came from.
 */
export interface AutomatedReportInput {
  eventId: string;
  /** The event's title now, kept on the report after the event is gone. */
  eventTitle: string;
  /** PHOTO or MEMBER. An automated report about the event itself isn't defined. */
  targetType: Exclude<ReportTargetType, "EVENT">;
  /** The photo, for a PHOTO report; null for a MEMBER report. */
  photoId: string | null;
  /** The photo's uploader, or the member; null when that account is gone. */
  reportedUserId: string | null;
  reason: ReportReason;
  /**
   * For the platform's reviewer: what the check found, such as screening's
   * labels. Written by us, never by a user. At most 500 characters.
   */
  note: string | null;
  /** The evidence snapshot, written in the same transaction (§7). */
  snapshot: EvidenceSnapshot;
}

/** Matches Report.note VarChar(500). */
const NOTE_MAX_LENGTH = 500;

/**
 * Files an automated report inside the caller's transaction, with its
 * evidence snapshot: no reporter, `source: AUTOMATED`, straight into the
 * platform's queue (`automated_flag`, plus what its reason sets: §3). Like a
 * member's report, a child-safety one is held from the start and an
 * intimate-image one gets its 48-hour deadline.
 *
 * One OPEN automated report per photo, by a partial unique index: when the
 * photo already has one, nothing is filed and this returns null. MEMBER
 * reports are not deduplicated.
 *
 * Log what it returns with `logAutomatedReport` once the transaction commits.
 */
export const fileAutomatedReport = async (
  tx: Prisma.TransactionClient,
  evidenceService: EvidenceService,
  input: AutomatedReportInput,
  now: Date = new Date(),
): Promise<Report | null> => {
  const [report] = await tx.report.createManyAndReturn({
    data: [
      {
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        reporterId: null,
        source: ReportSource.AUTOMATED,
        targetType: input.targetType,
        photoId: input.targetType === ReportTargetType.PHOTO ? input.photoId : null,
        reportedUserId: input.reportedUserId,
        reason: input.reason,
        note: input.note?.slice(0, NOTE_MAX_LENGTH) || null,
        queue: ReportQueue.PLATFORM,
        escalatedAt: now,
        escalationReasons: [ReportEscalation.AUTOMATED_FLAG, ...reasonEscalations(input.reason)],
        removalDueAt: removalDueAtFor(input.reason, now),
        ...initialHoldFor(input.reason, now),
      },
    ],
    skipDuplicates: true,
  });
  if (!report) return null;

  await evidenceService.writeSnapshot(tx, report.id, input.snapshot);
  return report;
};

/**
 * The audit line and the platform's alert for an automated report, as a
 * member's report logs them (docs/moderation.md §9). No caller: `source` says
 * who filed it. The note is not logged.
 */
export const logAutomatedReport = (logger: PinoLogger, report: Report, context: Record<string, unknown> = {}): void => {
  logger.info(
    {
      event: "report.created",
      reportId: report.id,
      eventId: report.eventId,
      source: report.source,
      targetType: report.targetType,
      photoId: report.photoId,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      queue: report.queue,
      ...context,
      audit: true,
    },
    "Automated report created",
  );
  logger.warn(
    escalationAlertFields(report, report.escalationReasons.map(escalationLogName)),
    "Report needs platform attention",
  );
};
