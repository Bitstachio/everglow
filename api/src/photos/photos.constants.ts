import { S3_KEY_UUID_SEGMENT } from "src/storage/storage.constants";

export const ALLOWED_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const MAX_UPLOAD_BATCH_SIZE = 20; // 20 photos per batch

// Long enough for the OS background uploader to finish on flaky cellular.
export const UPLOAD_URL_TTL_SECONDS = 3600; // 1 hour to upload a photo

export const DOWNLOAD_URL_TTL_SECONDS = 900; // 15 minutes to download a photo

// S3 checks a presigned URL's expiry when the PUT arrives, not when its body
// finishes, so a PUT that started just before the TTL ran out can still be
// streaming after it. A slot only counts as expired this long after the TTL.
// Generous on purpose: a 25 MB body on slow cellular takes minutes, not this.
export const UPLOAD_COMPLETION_GRACE_SECONDS = 15 * 60;

// Age past which a PENDING slot whose key holds no object can never complete:
// its URL no longer accepts a PUT and nothing started before that is still in
// flight. The sweeper releases such slots without waiting for
// DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS, which exists for slots that did receive
// an object and may still be confirmed.
export const EXPIRED_UPLOAD_SLOT_AGE_SECONDS = UPLOAD_URL_TTL_SECONDS + UPLOAD_COMPLETION_GRACE_SECONDS;

export const PHOTO_S3_KEY_PREFIX = "photos/";

/**
 * `photos/{eventId}/{photoId}`. The key names the event and the photo, never
 * the uploader: every presigned URL carries the key, and a photo kept after
 * its uploader deleted their account must not be groupable, across events, by
 * the id of the person who added it (docs/account-deletion.md §6a).
 *
 * Unique because the photo id is: a fresh UUID that is also the row's primary
 * key, with `Photo.s3Key` unique on top. The pre-#38 layout had the same
 * shape and used the row id too, so the two cannot collide either.
 */
export const buildPhotoS3Key = (eventId: string, photoId: string): string =>
  `${PHOTO_S3_KEY_PREFIX}${eventId}/${photoId}`;

// photos/{uploaderId}/{eventId}/{photoId}: what #38 to EV-205 minted. Rows
// minted then keep their key until the uploader's account is deleted with
// KEEP, which moves the photo to buildPhotoS3Key (account deletion's outbox).
const UPLOADER_PHOTO_S3_KEY_PATTERN = new RegExp(
  `^${PHOTO_S3_KEY_PREFIX}(${S3_KEY_UUID_SEGMENT})/(${S3_KEY_UUID_SEGMENT})/(${S3_KEY_UUID_SEGMENT})$`,
  "i",
);

/** The uploader id a key of the uploader layout embeds, or null for any other key. */
export const uploaderIdInPhotoS3Key = (key: string): string | null =>
  UPLOADER_PHOTO_S3_KEY_PATTERN.exec(key)?.[1]?.toLowerCase() ?? null;

// The image processor's renditions of an original (functions/image-processor/src/keys.ts):
// derived/{originalKey}/thumb.webp and derived/{originalKey}/large.jpg.
export const PHOTO_DERIVED_S3_KEY_PREFIX = "derived/";
export const PHOTO_THUMBNAIL_OBJECT_NAME = "thumb.webp";
export const PHOTO_LARGE_OBJECT_NAME = "large.jpg";

export interface PhotoDerivativeS3Keys {
  thumb: string;
  large: string;
}

/**
 * The one place the API builds derived keys. Matches derivedKeysForOriginal in
 * functions/image-processor/src/keys.ts, legacy original keys included; the
 * spec pins the two against each other.
 */
export const buildPhotoDerivativeS3Keys = (originalKey: string): PhotoDerivativeS3Keys => {
  const base = `${PHOTO_DERIVED_S3_KEY_PREFIX}${originalKey}`;
  return { thumb: `${base}/${PHOTO_THUMBNAIL_OBJECT_NAME}`, large: `${base}/${PHOTO_LARGE_OBJECT_NAME}` };
};

export const buildPhotoThumbnailS3Key = (originalKey: string): string => buildPhotoDerivativeS3Keys(originalKey).thumb;

/** True for keys the image processor renders: everything under photos/, like its ObjectCreated filter. */
export const hasPhotoDerivatives = (key: string): boolean => key.startsWith(PHOTO_S3_KEY_PREFIX);

/**
 * Each key followed by its derived keys when it is a photo original, for one
 * DeleteObjects batch. Other keys (event covers, avatars) pass through alone.
 */
export const withPhotoDerivativeS3Keys = (keys: string[]): string[] =>
  keys.flatMap((key) => {
    if (!hasPhotoDerivatives(key)) return [key];
    const { thumb, large } = buildPhotoDerivativeS3Keys(key);
    return [key, thumb, large];
  });

// The current photos/{eventId}/{photoId} layout (also the pre-#38 one) plus
// the photos/{uploaderId}/{eventId}/{photoId} layout between them, whose rows
// still reference their keys.
const PHOTO_S3_KEY_PATTERNS = [
  new RegExp(`^${PHOTO_S3_KEY_PREFIX}${S3_KEY_UUID_SEGMENT}/${S3_KEY_UUID_SEGMENT}$`, "i"),
  UPLOADER_PHOTO_S3_KEY_PATTERN,
];

/** True for keys the API could have minted; anything else under the prefix is not ours to touch. */
export const isPhotoS3Key = (key: string): boolean => PHOTO_S3_KEY_PATTERNS.some((pattern) => pattern.test(key));

// Upload reservation runs as a Serializable transaction. When reservations for
// the same gallery overlap, Postgres aborts all but one per round with a
// serialization failure (SQLSTATE 40001); the losers retry with a short
// jittered linear backoff before giving up with 409. Five attempts cleared
// bursts of eight parallel in-quota batches without a 409 when measured
// against Postgres 16; three attempts started giving up at four.
export const STORAGE_RESERVATION_MAX_ATTEMPTS = 5;

// Attempt n waits DELAY * n plus up to DELAY of jitter so retries do not
// re-collide in lockstep.
export const STORAGE_RESERVATION_RETRY_DELAY_MS = 25;

// Stale PENDING rows (never confirmed) are swept after this age. Must exceed
// UPLOAD_URL_TTL_SECONDS so in-flight background uploads can finish and confirm.
// Sweeping them is also what releases the gallery storage they hold.
export const DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS = 24;

export const DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE = 100;

// Galleries the close job closes per run, and closed galleries it sweeps per
// run. A backlog drains at this many an hour; raise GALLERY_CLOSE_BATCH_SIZE
// for a spike.
export const DEFAULT_GALLERY_CLOSE_BATCH_SIZE = 100;

// Photos removed from one gallery per round: one delete statement and one S3
// DeleteObjects batch each, so a large gallery never holds a long transaction.
export const GALLERY_CLOSE_PHOTO_CHUNK_SIZE = 500;

// Confirm hashes each verified original by streaming it from S3 once
// (docs/moderation.md §7). At most this many stream at a time per confirm, so
// a batch of 20 large photos doesn't pull 500 MB at once, and each read gives
// up after the timeout: the photo is confirmed without a hash, and the
// backfill job hashes it later.
export const PHOTO_HASH_CONCURRENCY = 4;
export const PHOTO_HASH_TIMEOUT_MS = 20_000;

// READY photos without a hash that the backfill job hashes per run.
export const DEFAULT_PHOTO_HASH_BACKFILL_BATCH_SIZE = 100;

// Per-photo outcome of a confirm call. READY flips the row; MISSING and
// MISMATCHED are final verdicts that release the slot (row, and object if one
// landed) so the client mints a fresh one; NOT_FOUND names an id that is not a
// pending upload of the caller in this event.
export const CONFIRM_PHOTO_STATUSES = {
  READY: "READY",
  MISSING: "MISSING",
  MISMATCHED: "MISMATCHED",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type ConfirmPhotoStatus = (typeof CONFIRM_PHOTO_STATUSES)[keyof typeof CONFIRM_PHOTO_STATUSES];
