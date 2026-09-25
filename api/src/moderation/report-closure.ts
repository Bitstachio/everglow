import { Prisma, ReportStatus } from "generated/prisma/client";

/**
 * Closes the OPEN reports on photos that are being deleted, as ACTIONED: the
 * photo is gone, so there is nothing left for an organizer to decide. Run it
 * in the same transaction as the delete, before it: afterwards the reports'
 * photoId is SET NULL and nothing finds them by photo any more. Left open,
 * they would wait for a verdict nobody can give, which for a photo uploaded
 * by the event's only organizer means a stale-report alert every hour.
 */
export async function closeReportsOnDeletedPhotos(
  tx: Prisma.TransactionClient,
  photoIds: string[],
  closedById: string,
): Promise<number> {
  if (photoIds.length === 0) return 0;

  const { count } = await tx.report.updateMany({
    where: { photoId: { in: photoIds }, status: ReportStatus.OPEN },
    data: { status: ReportStatus.ACTIONED, resolvedById: closedById, resolvedAt: new Date() },
  });
  return count;
}
