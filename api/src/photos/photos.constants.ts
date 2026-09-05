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

export const buildPhotoS3Key = (userId: string, eventId: string, photoId: string): string =>
  `photos/${userId}/${eventId}/${photoId}`;

export const FREE_TIER_STORAGE_LIMIT_BYTES = 5n * 1024n * 1024n * 1024n; // 5 GiB

export const STORAGE_QUOTA_EXCEEDED_CODE = "STORAGE_QUOTA_EXCEEDED";

export const STORAGE_RESERVATION_CONFLICT_CODE = "STORAGE_RESERVATION_CONFLICT";

// Quota reservation runs as a Serializable transaction. When reservations for
// the same uploader overlap, Postgres aborts all but one per round with a
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
// Sweeping them is also what releases the quota they hold.
export const DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS = 24;

export const DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE = 100;

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
  INVALID_STORAGE_INCREMENT: (value: string) =>
    `Storage limit increase must be a positive whole number of bytes, received "${value}"`,
  STORAGE_RESERVATION_CONFLICT: "Storage reservation conflicted with a concurrent upload, please retry",
};
