import { Prisma } from "generated/prisma/client";
import { ReportCloser, closeReportsOnDeletedPhotos } from "src/moderation/report-closure";
import { EscalatedReport } from "src/moderation/report-escalation";

export interface DeleteUploadsInput {
  eventId: string;
  /** Whose uploads: only photos this user added are ever touched. */
  userId: string;
  /** Who deletes, and in which capacity: decides how the photos' OPEN reports close. */
  closedBy: ReportCloser;
  /** Photos the caller deletes itself, e.g. the one a report is about. */
  excludePhotoIds?: string[];
}

export interface DeletedUploads {
  /** Objects to purge once the transaction has committed. */
  photoKeys: string[];
  photosDeleted: number;
  /** Storage freed in the event's gallery. */
  bytesFreed: bigint;
  reportsClosed: number;
  /** Reports on the deleted photos that stay OPEN and moved to the platform; the caller logs them. */
  reportsEscalated: EscalatedReport[];
}

/**
 * Deletes the photos a user uploaded to one event, whatever their status,
 * inside the caller's transaction. Leaving an event and being removed from one
 * both come through here. Their OPEN reports are closed first, because the
 * delete sets the reports' photoId to null. Objects are the caller's to purge
 * after the commit, never inside a database transaction.
 */
export const deleteUploadsInTransaction = async (
  tx: Prisma.TransactionClient,
  { eventId, userId, closedBy, excludePhotoIds = [] }: DeleteUploadsInput,
): Promise<DeletedUploads> => {
  const uploaded = await tx.photo.findMany({
    where: { eventId, addedById: userId, id: { notIn: excludePhotoIds } },
    select: { id: true, s3Key: true, sizeBytes: true },
  });
  if (uploaded.length === 0) {
    return { photoKeys: [], photosDeleted: 0, bytesFreed: 0n, reportsClosed: 0, reportsEscalated: [] };
  }

  const ids = uploaded.map((photo) => photo.id);
  const reports = await closeReportsOnDeletedPhotos(tx, ids, closedBy);
  const { count } = await tx.photo.deleteMany({ where: { id: { in: ids } } });

  return {
    photoKeys: uploaded.map((photo) => photo.s3Key),
    photosDeleted: count,
    bytesFreed: uploaded.reduce((sum, photo) => sum + BigInt(photo.sizeBytes), 0n),
    reportsClosed: reports.closed,
    reportsEscalated: reports.escalated,
  };
};
