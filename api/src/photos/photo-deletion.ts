import { Prisma, ReportClosedReason } from "generated/prisma/client";
import { closeReportsOnDeletedPhotos } from "src/moderation/report-closure";

export interface DeleteUploadsInput {
  eventId: string;
  /** Whose uploads: only photos this user added are ever touched. */
  userId: string;
  /** Recorded as the resolver of any reports the deletion closes. */
  closedById: string;
  /** Recorded on any reports the deletion closes. */
  closedReason: ReportClosedReason;
  /** Only these photos; all of the user's photos in the event when omitted. */
  photoIds?: string[];
  /** Photos the caller deletes itself, e.g. the one a report is about. */
  excludePhotoIds?: string[];
}

export interface DeletedUploads {
  /** Objects to purge once the transaction has committed. */
  photoKeys: string[];
  photosDeleted: number;
  /** Quota returned to the uploader. */
  bytesFreed: bigint;
  reportsClosed: number;
}

/**
 * Deletes photos a user uploaded to one event, whatever their status, inside
 * the caller's transaction. Leaving an event, being removed from one, and
 * clearing space from the storage screen all come through here. Their OPEN
 * reports are closed first, because the delete sets the reports' photoId to
 * null. Objects are the caller's to purge after the commit, never inside a
 * database transaction.
 */
export async function deleteUploadsInTransaction(
  tx: Prisma.TransactionClient,
  { eventId, userId, closedById, closedReason, photoIds, excludePhotoIds = [] }: DeleteUploadsInput,
): Promise<DeletedUploads> {
  const uploaded = await tx.photo.findMany({
    where: { eventId, addedById: userId, id: { ...(photoIds && { in: photoIds }), notIn: excludePhotoIds } },
    select: { id: true, s3Key: true, sizeBytes: true },
  });
  if (uploaded.length === 0) return { photoKeys: [], photosDeleted: 0, bytesFreed: 0n, reportsClosed: 0 };

  const ids = uploaded.map((photo) => photo.id);
  const reportsClosed = await closeReportsOnDeletedPhotos(tx, ids, closedById, closedReason);
  const { count } = await tx.photo.deleteMany({ where: { id: { in: ids } } });

  return {
    photoKeys: uploaded.map((photo) => photo.s3Key),
    photosDeleted: count,
    bytesFreed: uploaded.reduce((sum, photo) => sum + BigInt(photo.sizeBytes), 0n),
    reportsClosed,
  };
}
