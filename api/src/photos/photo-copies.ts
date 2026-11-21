import { Photo, PhotoStatus, Prisma } from "generated/prisma/client";
import { lockForTransaction } from "src/prisma/advisory-lock";

/** What became of the photos of one confirm once second copies were told apart. */
export interface CopiesOnTheRoll {
  /** Photos made READY, in request order. */
  first: Photo[];
  /**
   * Each second copy's id, and the id of the READY photo or earlier pick it
   * copies. Its slot is released; its object is the caller's to delete.
   */
  copies: Map<string, string>;
  /** Photos whose slot was gone by the time of the flip: cancelled or swept while they were verified. */
  gone: string[];
}

/** The advisory lock that orders confirms by one uploader in one event. */
export const photoCopiesLockKey = (eventId: string, uploaderId: string): string =>
  `photo-copies:${eventId}:${uploaderId}`;

/**
 * Makes the verified photos of one confirm READY, except the ones that
 * already sit on the roll: a READY photo of the same uploader in the same
 * event has the same hash, or an earlier photo in this request does (request
 * order, so the first pick wins). Photos without a hash always go through.
 * Another person's copy never counts, and a deleted photo has no row to
 * count.
 *
 * Runs inside the READY flip's transaction and takes a lock per uploader and
 * event first, hashes or not, so two confirms by one person check and write
 * one after the other. It then goes by the rows as they are under the lock,
 * not as the request read them:
 *
 * - a photo a concurrent confirm already made READY is the copy kept,
 *   whatever hash that confirm gave it, and is never a second copy;
 * - a second copy's slot is released here, in the same transaction, so no
 *   later confirm of that id can make it READY while its object is deleted;
 * - a photo whose slot is gone (cancelled, or swept) is neither made READY
 *   nor counted as the first of its bytes, so the next pick takes its place.
 */
export const settleCopiesOnTheRoll = async (
  tx: Prisma.TransactionClient,
  {
    eventId,
    uploaderId,
    photos,
    hashes,
    requestOrder,
    readyData,
  }: {
    eventId: string;
    uploaderId: string;
    photos: Photo[];
    hashes: Map<string, string | null>;
    requestOrder: string[];
    /** What the READY flip writes for a photo. */
    readyData: (photo: Photo) => Prisma.PhotoUpdateManyMutationInput;
  },
): Promise<CopiesOnTheRoll> => {
  const position = new Map(requestOrder.map((id, index) => [id, index]));
  const ordered = [...photos].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  await lockForTransaction(tx, photoCopiesLockKey(eventId, uploaderId));
  const current = await tx.photo.findMany({
    where: { id: { in: ordered.map((photo) => photo.id) } },
    select: { id: true, status: true },
  });
  const statusNow = new Map(current.map((row) => [row.id, row.status]));
  const pending = ordered.filter((photo) => statusNow.get(photo.id) === PhotoStatus.PENDING);
  const gone = ordered.filter((photo) => !statusNow.has(photo.id)).map((photo) => photo.id);

  const hashed = [...new Set(pending.map((photo) => hashes.get(photo.id)).filter((hash): hash is string => !!hash))];
  const onRoll =
    hashed.length > 0
      ? await tx.photo.findMany({
          where: { eventId, addedById: uploaderId, status: PhotoStatus.READY, sha256: { in: hashed } },
          select: { id: true, sha256: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : [];
  // The oldest READY photo of each hash: the one a later copy points at.
  const kept = new Map<string, string>();
  for (const photo of onRoll) {
    if (photo.sha256 && !kept.has(photo.sha256)) kept.set(photo.sha256, photo.id);
  }

  const first: Photo[] = [];
  const copies = new Map<string, string>();
  for (const photo of pending) {
    const hash = hashes.get(photo.id);
    const existing = hash ? kept.get(hash) : undefined;
    // Guarded on PENDING, and counted: a cancel doesn't take this lock, so a
    // slot can still go between the read above and the write here.
    const { count } = existing
      ? await tx.photo.deleteMany({ where: { id: photo.id, status: PhotoStatus.PENDING } })
      : await tx.photo.updateMany({ where: { id: photo.id, status: PhotoStatus.PENDING }, data: readyData(photo) });
    if (count === 0) {
      gone.push(photo.id);
    } else if (existing) {
      copies.set(photo.id, existing);
    } else {
      if (hash) kept.set(hash, photo.id);
      first.push(photo);
    }
  }
  return { first, copies, gone };
};
