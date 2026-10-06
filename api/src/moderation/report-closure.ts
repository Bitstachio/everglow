import {
  Prisma,
  ReportActorRole,
  ReportClosedReason,
  ReportEscalation,
  ReportQueue,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { SEVERE_REPORT_REASONS } from "./moderation.constants";
import { EscalatedReport, escalateToPlatform } from "./report-escalation";

/** Who closes reports as a side effect of a delete, and in which capacity. */
export interface ReportCloser {
  id: string;
  role: ReportActorRole;
}

/** What a delete did to the OPEN reports on what it deleted. */
export interface DeletedTargetReports {
  closed: number;
  /** Reports that stay OPEN and moved to the platform: log them once the transaction has committed. */
  escalated: EscalatedReport[];
}

type OpenReport = {
  id: string;
  photoId: string | null;
  queue: ReportQueue;
  reason: ReportReason;
  reporterId: string | null;
  reportedUserId: string | null;
};

const isSevere = (report: Pick<OpenReport, "reason">): boolean => SEVERE_REPORT_REASONS.includes(report.reason);

/**
 * Settles the OPEN reports on photos that are being deleted. Run it in the
 * same transaction as the delete, before it: afterwards the reports' photoId
 * is SET NULL and nothing finds them by photo any more.
 *
 * Per photo (docs/moderation.md §3):
 *
 * - The platform deleting it, or an organizer who may close every OPEN report
 *   on it (none is with the platform, filed by them, or about them), has
 *   judged it: they close as ACTIONED, PHOTO_REMOVED.
 * - Any other delete is not a verdict. Reports that aren't severe and are
 *   still with the organizers close as TARGET_GONE, PHOTO_DELETED. The rest
 *   stay OPEN and move to the platform (TARGET_DELETED), to be judged on their
 *   evidence: deleting a photo doesn't make a serious report go away.
 */
export const closeReportsOnDeletedPhotos = async (
  tx: Prisma.TransactionClient,
  photoIds: string[],
  closer: ReportCloser,
): Promise<DeletedTargetReports> => {
  if (photoIds.length === 0) return { closed: 0, escalated: [] };

  const open: OpenReport[] = await tx.report.findMany({
    where: { photoId: { in: photoIds }, status: ReportStatus.OPEN },
    select: { id: true, photoId: true, queue: true, reason: true, reporterId: true, reportedUserId: true },
  });
  if (open.length === 0) return { closed: 0, escalated: [] };

  const byPhoto = new Map<string, OpenReport[]>();
  for (const report of open) byPhoto.set(report.photoId!, [...(byPhoto.get(report.photoId!) ?? []), report]);

  const removed: string[] = [];
  const gone: string[] = [];
  const toPlatform: string[] = [];
  for (const reports of byPhoto.values()) {
    if (judges(closer, reports)) {
      removed.push(...reports.map((report) => report.id));
      continue;
    }
    for (const report of reports) {
      if (report.queue === ReportQueue.ORGANIZERS && !isSevere(report)) gone.push(report.id);
      else toPlatform.push(report.id);
    }
  }

  const resolvedAt = new Date();
  const closedBy = { closedByRole: closer.role, resolvedById: closer.id, resolvedAt };
  const [actioned, targetGone] = await Promise.all([
    removed.length > 0
      ? tx.report.updateMany({
          where: { id: { in: removed }, status: ReportStatus.OPEN },
          data: { status: ReportStatus.ACTIONED, closedReason: ReportClosedReason.PHOTO_REMOVED, ...closedBy },
        })
      : { count: 0 },
    gone.length > 0
      ? tx.report.updateMany({
          where: { id: { in: gone }, status: ReportStatus.OPEN },
          data: { status: ReportStatus.TARGET_GONE, closedReason: ReportClosedReason.PHOTO_DELETED, ...closedBy },
        })
      : { count: 0 },
  ]);
  const escalated = await escalateToPlatform(tx, toPlatform, ReportEscalation.TARGET_DELETED);

  return { closed: actioned.count + targetGone.count, escalated };
};

/** Whether this delete is a verdict on every OPEN report about the photo. */
const judges = (closer: ReportCloser, reports: OpenReport[]): boolean => {
  if (closer.role === ReportActorRole.PLATFORM) return true;
  if (closer.role !== ReportActorRole.ORGANIZER) return false;
  return reports.every(
    (report) =>
      report.queue === ReportQueue.ORGANIZERS && report.reporterId !== closer.id && report.reportedUserId !== closer.id,
  );
};

/**
 * Settles the OPEN member reports about an account that is being deleted:
 * there is nobody left to remove. Those that aren't severe close as
 * TARGET_GONE, ACCOUNT_DELETED; severe ones stay OPEN and move to the
 * platform (TARGET_DELETED). Run it in the account-deletion transaction,
 * before the user row goes and reportedUserId is SET NULL.
 */
export const closeMemberReportsOnDeletedAccount = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<DeletedTargetReports> => {
  const memberReports = { reportedUserId: userId, targetType: ReportTargetType.MEMBER, status: ReportStatus.OPEN };

  const { count } = await tx.report.updateMany({
    where: { ...memberReports, reason: { notIn: [...SEVERE_REPORT_REASONS] } },
    data: {
      status: ReportStatus.TARGET_GONE,
      closedReason: ReportClosedReason.ACCOUNT_DELETED,
      closedByRole: ReportActorRole.SYSTEM,
      resolvedAt: new Date(),
    },
  });

  const severe = await tx.report.findMany({
    where: { ...memberReports, queue: ReportQueue.ORGANIZERS },
    select: { id: true },
  });
  const escalated = await escalateToPlatform(
    tx,
    severe.map((report) => report.id),
    ReportEscalation.TARGET_DELETED,
  );

  return { closed: count, escalated };
};
