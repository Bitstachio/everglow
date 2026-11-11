import { Photo, PhotoStatus, Prisma } from "generated/prisma/client";
import { lockForTransaction } from "src/prisma/advisory-lock";

/** The photos of one confirm, split into the ones to flip READY and the second copies to discard. */
export interface CopiesOnTheRoll {
  /** Photos to make READY, in request order. */
  first: Photo[];
  /** Each second copy's id, and the id of the READY photo or earlier pick it copies. */
  copies: Map<string, string>;
}

/** The advisory lock that orders confirms by one uploader in one event. */
export const photoCopiesLockKey = (eventId: string, uploaderId: string): string =>
  `photo-copies:${eventId}:${uploaderId}`;

/**
 * Decides which verified photos already sit on the roll: a READY photo of the
 * same uploader in the same event has the same hash, or an earlier photo in
 * this request does (request order, so the first pick wins). Photos without a
 * hash always go through. Another person's copy never counts, and a deleted
 * photo has no row to count.
 *
 * Runs inside the READY flip's transaction and takes a lock per uploader and
 * event first, so two confirms of the same bytes check and flip one after
 * the other: the second sees the first one's READY row. A photo of this
 * request that a concurrent confirm already made READY is the copy kept.
 */
export const findCopiesOnTheRoll = async (
  tx: Prisma.TransactionClient,
  {
    eventId,
    uploaderId,
    photos,
    hashes,
    requestOrder,
  }: {
    eventId: string;
    uploaderId: string;
    photos: Photo[];
    hashes: Map<string, string | null>;
    requestOrder: string[];
  },
): Promise<CopiesOnTheRoll> => {
  const position = new Map(requestOrder.map((id, index) => [id, index]));
  const ordered = [...photos].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const hashed = [...new Set(ordered.map((photo) => hashes.get(photo.id)).filter((hash): hash is string => !!hash))];
  if (hashed.length === 0) return { first: ordered, copies: new Map() };

  await lockForTransaction(tx, photoCopiesLockKey(eventId, uploaderId));
  const onRoll = await tx.photo.findMany({
    where: { eventId, addedById: uploaderId, status: PhotoStatus.READY, sha256: { in: hashed } },
    select: { id: true, sha256: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const ready = new Set<string>();
  // The oldest READY photo of each hash: the one a later copy points at.
  const kept = new Map<string, string>();
  for (const photo of onRoll) {
    if (!photo.sha256) continue;
    ready.add(photo.id);
    if (!kept.has(photo.sha256)) kept.set(photo.sha256, photo.id);
  }

  const first: Photo[] = [];
  const copies = new Map<string, string>();
  for (const photo of ordered) {
    const hash = hashes.get(photo.id);
    // Already READY through a concurrent confirm: it is the copy on the roll.
    if (ready.has(photo.id)) continue;
    const existing = hash ? kept.get(hash) : undefined;
    if (existing) {
      copies.set(photo.id, existing);
      continue;
    }
    if (hash) kept.set(hash, photo.id);
    first.push(photo);
  }
  return { first, copies };
};
