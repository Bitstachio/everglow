import { Prisma, ReportClosedReason, ReportStatus } from "generated/prisma/client";

/**
 * Closes the OPEN reports on photos that are being deleted, as ACTIONED: the
 * photo is gone, so there is nothing left for an organizer to decide. Run it
 * in the same transaction as the delete, before it: afterwards the reports'
 * photoId is SET NULL and nothing finds them by photo any more. Left open,
 * they would wait for a verdict nobody can give, which for a photo uploaded
 * by the event's only organizer means a stale-report alert every hour. The
 * reports themselves are kept, with `closedReason` saying how the photo went.
 */
export async function closeReportsOnDeletedPhotos(
  tx: Prisma.TransactionClient,
  photoIds: string[],
  closedById: string,
  closedReason: ReportClosedReason,
): Promise<number> {
  if (photoIds.length === 0) return 0;

  const { count } = await tx.report.updateMany({
    where: { photoId: { in: photoIds }, status: ReportStatus.OPEN },
    data: { status: ReportStatus.ACTIONED, closedReason, resolvedById: closedById, resolvedAt: new Date() },
  });
  return count;
}

/**
 * Closes every OPEN report in an event that is being deleted, in the same
 * transaction and before the delete. The reports outlive the event: its
 * deletion sets their eventId to null, and eventTitle still says where they
 * were filed (docs/moderation.md, "What happens on delete").
 */
export async function closeReportsOnDeletedEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  closedById: string,
): Promise<number> {
  const { count } = await tx.report.updateMany({
    where: { eventId, status: ReportStatus.OPEN },
    data: {
      status: ReportStatus.ACTIONED,
      closedReason: ReportClosedReason.EVENT_DELETED,
      resolvedById: closedById,
      resolvedAt: new Date(),
    },
  });
  return count;
}
