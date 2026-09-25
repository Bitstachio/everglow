import { Prisma } from "generated/prisma/client";
import { closeReportsOnDeletedPhotos } from "src/moderation/report-closure";

/** What happens to a removed member's photos in the event. The organizer chooses. */
export const REMOVED_MEMBER_PHOTOS = {
  /** They stay in the event, still credited to the member. */
  KEEP: "KEEP",
  /** Everything the member uploaded to the event is deleted. */
  DELETE: "DELETE",
} as const;
export type RemovedMemberPhotos = (typeof REMOVED_MEMBER_PHOTOS)[keyof typeof REMOVED_MEMBER_PHOTOS];

export interface RemoveMemberInput {
  eventId: string;
  userId: string;
  /** The organizer removing them: recorded on the ban, and as the resolver of any reports it closes. */
  removedById: string;
  photos: RemovedMemberPhotos;
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
 * A plain function rather than a service method: ReportsService needs it, and
 * ModerationModule cannot import EventsModule without a cycle.
 */
export async function removeMemberInTransaction(
  tx: Prisma.TransactionClient,
  { eventId, userId, removedById, photos, excludePhotoIds = [] }: RemoveMemberInput,
): Promise<RemovedMember> {
  await tx.eventAccess.deleteMany({ where: { eventId, userId } });
  await tx.eventBan.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, bannedById: removedById },
    update: {},
  });

  if (photos === REMOVED_MEMBER_PHOTOS.KEEP) return { photoKeys: [], photosDeleted: 0, reportsClosed: 0 };

  const uploaded = await tx.photo.findMany({
    where: { eventId, addedById: userId, id: { notIn: excludePhotoIds } },
    select: { id: true, s3Key: true },
  });
  const ids = uploaded.map((photo) => photo.id);
  const reportsClosed = await closeReportsOnDeletedPhotos(tx, ids, removedById);
  const { count } = await tx.photo.deleteMany({ where: { id: { in: ids } } });

  return { photoKeys: uploaded.map((photo) => photo.s3Key), photosDeleted: count, reportsClosed };
}
