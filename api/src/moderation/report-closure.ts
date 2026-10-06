import { Prisma, ReportActorRole, ReportClosedReason, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { SEVERE_REPORT_REASONS } from "./moderation.constants";

/** Who closes reports as a side effect of a delete, and in which capacity. */
export interface ReportCloser {
  id: string;
  role: ReportActorRole;
}

/** Roles whose delete of a reported photo is a judgement on it, not just its disappearance. */
const JUDGING_ROLES: ReportActorRole[] = [ReportActorRole.ORGANIZER, ReportActorRole.PLATFORM];

/**
 * Closes the OPEN reports on photos that are being deleted. Run it in the same
 * transaction as the delete, before it: afterwards the reports' photoId is SET
 * NULL and nothing finds them by photo any more.
 *
 * How they close depends on who deletes (docs/moderation.md §3): an organizer
 * or the platform deleting a reported photo has judged it, so the reports
 * close as ACTIONED, PHOTO_REMOVED. Its uploader deleting it, or a job, is not
 * a verdict: they close as TARGET_GONE, PHOTO_DELETED, and never count
 * against anyone.
 */
export const closeReportsOnDeletedPhotos = async (
  tx: Prisma.TransactionClient,
  photoIds: string[],
  closer: ReportCloser,
): Promise<number> => {
  if (photoIds.length === 0) return 0;

  const judged = JUDGING_ROLES.includes(closer.role);
  const { count } = await tx.report.updateMany({
    where: { photoId: { in: photoIds }, status: ReportStatus.OPEN },
    data: {
      status: judged ? ReportStatus.ACTIONED : ReportStatus.TARGET_GONE,
      closedReason: judged ? ReportClosedReason.PHOTO_REMOVED : ReportClosedReason.PHOTO_DELETED,
      closedByRole: closer.role,
      resolvedById: closer.id,
      resolvedAt: new Date(),
    },
  });
  return count;
};

/**
 * Closes the OPEN member reports about an account that is being deleted, as
 * TARGET_GONE, ACCOUNT_DELETED: there is nobody left to remove. Reports for a
 * severe reason stay OPEN for the platform. Run it in the account-deletion
 * transaction, before the user row goes and reportedUserId is SET NULL.
 */
export const closeMemberReportsOnDeletedAccount = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number> => {
  const { count } = await tx.report.updateMany({
    where: {
      reportedUserId: userId,
      targetType: ReportTargetType.MEMBER,
      status: ReportStatus.OPEN,
      reason: { notIn: [...SEVERE_REPORT_REASONS] },
    },
    data: {
      status: ReportStatus.TARGET_GONE,
      closedReason: ReportClosedReason.ACCOUNT_DELETED,
      closedByRole: ReportActorRole.SYSTEM,
      resolvedAt: new Date(),
    },
  });
  return count;
};
