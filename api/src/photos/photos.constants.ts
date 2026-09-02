import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const photoEntity = "Photo";

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

export const DEFAULT_PHOTO_PAGE_SIZE = 50;

export const MAX_PHOTO_PAGE_SIZE = 100;

export const PHOTO_S3_KEY_PREFIX = "photos/";

export const buildPhotoS3Key = (userId: string, eventId: string, photoId: string): string =>
  `${PHOTO_S3_KEY_PREFIX}${userId}/${eventId}/${photoId}`;

const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// The current photos/{userId}/{eventId}/{photoId} layout plus the pre-#38
// photos/{eventId}/{photoId} layout, whose rows still reference their old keys.
const PHOTO_S3_KEY_PATTERNS = [
  new RegExp(`^${PHOTO_S3_KEY_PREFIX}${UUID_SEGMENT}/${UUID_SEGMENT}/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^${PHOTO_S3_KEY_PREFIX}${UUID_SEGMENT}/${UUID_SEGMENT}$`, "i"),
];

/** True for keys the API could have minted; anything else under the prefix is not ours to touch. */
export const isPhotoS3Key = (key: string): boolean => PHOTO_S3_KEY_PATTERNS.some((pattern) => pattern.test(key));

// The orphan reconciler deletes at most this many objects per run. It bounds
// the blast radius of a bad run more than the work: the prefix is walked end
// to end regardless, and whatever is left waits for the next run.
export const DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE = 100;

// Objects younger than this are never considered orphans, so an upload that
// finished moments ago is safe even if its row is somehow not visible yet.
// Matches the stale-PENDING cleanup age.
export const DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS = 24;

export const FREE_TIER_STORAGE_LIMIT_BYTES = 5n * 1024n * 1024n * 1024n; // 5 GiB

export const STORAGE_QUOTA_EXCEEDED_CODE = "STORAGE_QUOTA_EXCEEDED";

// Per-photo outcome of a confirm call. Only READY mutates the row; the rest
// report why verification failed so the client can retry or re-upload.
export const CONFIRM_PHOTO_STATUSES = {
  READY: "READY",
  MISSING: "MISSING",
  MISMATCHED: "MISMATCHED",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type ConfirmPhotoStatus = (typeof CONFIRM_PHOTO_STATUSES)[keyof typeof CONFIRM_PHOTO_STATUSES];

export const PHOTO_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(photoEntity, "ID", id),
  CREATE_FORBIDDEN: (eventId: string) => `Not authorized to upload photos to event with ID "${eventId}"`,
  CONFIRM_FORBIDDEN: (eventId: string) => `Not authorized to confirm photo uploads in event with ID "${eventId}"`,
  LIST_FORBIDDEN: (eventId: string) => `Not authorized to list photos of event with ID "${eventId}"`,
  READ_FORBIDDEN: (photoId: string) => `Not authorized to read photo with ID "${photoId}"`,
  DELETE_FORBIDDEN: (photoId: string) => `Not authorized to delete photo with ID "${photoId}"`,
  STORAGE_QUOTA_EXCEEDED: "Storage quota exceeded",
};
