import { Prisma } from "generated/prisma/client";
import { closeReportsOnDeletedPhotos } from "src/moderation/report-closure";

export interface DeleteUploadsInput {
  eventId: string;
  /** Whose uploads: only photos this user added are ever touched. */
  userId: string;
  /** Recorded as the resolver of any reports the deletion closes. */
  closedById: string;
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
  { eventId, userId, closedById, excludePhotoIds = [] }: DeleteUploadsInput,
): Promise<DeletedUploads> => {
  const uploaded = await tx.photo.findMany({
    where: { eventId, addedById: userId, id: { notIn: excludePhotoIds } },
    select: { id: true, s3Key: true, sizeBytes: true },
  });
  if (uploaded.length === 0) return { photoKeys: [], photosDeleted: 0, bytesFreed: 0n, reportsClosed: 0 };

  const ids = uploaded.map((photo) => photo.id);
  const reportsClosed = await closeReportsOnDeletedPhotos(tx, ids, closedById);
  const { count } = await tx.photo.deleteMany({ where: { id: { in: ids } } });

  return {
    photoKeys: uploaded.map((photo) => photo.s3Key),
    photosDeleted: count,
    bytesFreed: uploaded.reduce((sum, photo) => sum + BigInt(photo.sizeBytes), 0n),
    reportsClosed,
  };
};
