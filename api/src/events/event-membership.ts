import { Prisma } from "generated/prisma/client";
import { deleteUploadsInTransaction } from "src/photos/photo-deletion";

/**
 * What happens to a departing member's photos in the event: chosen by the
 * organizer who removes them, or by the member who leaves.
 */
export const MEMBER_PHOTOS = {
  /** They stay in the event, still credited to the member and counted against their storage; they can delete them later. */
  KEEP: "KEEP",
  /** Everything the member uploaded to the event is deleted. */
  DELETE: "DELETE",
} as const;
export type MemberPhotos = (typeof MEMBER_PHOTOS)[keyof typeof MEMBER_PHOTOS];

export interface RemoveMemberInput {
  eventId: string;
  userId: string;
  /** The organizer removing them: recorded on the ban, and as the resolver of any reports it closes. */
  removedById: string;
  photos: MemberPhotos;
  /** Photos the caller deletes itself, e.g. the one a report is about. */
  excludePhotoIds?: string[];
}

export interface RemovedMember {
  /** Objects to purge once the transaction has committed. */
  photoKeys: string[];
  photosDeleted: number;
  reportsClosed: number;
}

/**
 * An organizer removing a member, by either route: the participant endpoint
 * or REMOVE_MEMBER on a report. Run it inside the caller's transaction. It
 * deletes the membership, bans them from rejoining through the invitation
 * link (a repeat ban keeps the first), and with DELETE removes every photo
 * they uploaded to the event, closing those photos' OPEN reports first
 * because their photoId is SET NULL with the row. Objects are the caller's to
 * purge after the commit, never inside a database transaction.
 *
 * A plain helper rather than a service method: ReportsService needs it, and
 * ModerationModule cannot import EventsModule without a cycle.
 */
export const removeMemberInTransaction = async (
  tx: Prisma.TransactionClient,
  { eventId, userId, removedById, photos, excludePhotoIds = [] }: RemoveMemberInput,
): Promise<RemovedMember> => {
  await tx.eventAccess.deleteMany({ where: { eventId, userId } });
  await tx.eventBan.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, bannedById: removedById },
    update: {},
  });

  if (photos === MEMBER_PHOTOS.KEEP) return { photoKeys: [], photosDeleted: 0, reportsClosed: 0 };

  const deleted = await deleteUploadsInTransaction(tx, { eventId, userId, closedById: removedById, excludePhotoIds });
  return { photoKeys: deleted.photoKeys, photosDeleted: deleted.photosDeleted, reportsClosed: deleted.reportsClosed };
};
