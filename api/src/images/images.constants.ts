import { S3_KEY_UUID_SEGMENT } from "src/storage/storage.constants";

// Single display images (avatars, covers) are shown to other people on every
// platform, so only formats every client decodes are accepted; clients
// re-encode after cropping anyway. Event photos keep their own, wider list.
export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

// A cropped display image, not an original. Event photos keep their own 25 MB cap.
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const isAllowedImageContentType = (contentType: string | undefined): contentType is AllowedImageContentType =>
  (ALLOWED_IMAGE_CONTENT_TYPES as readonly (string | undefined)[]).includes(contentType);

export const isAllowedImageSize = (sizeBytes: number | undefined): sizeBytes is number =>
  sizeBytes !== undefined && Number.isInteger(sizeBytes) && sizeBytes >= 1 && sizeBytes <= MAX_IMAGE_SIZE_BYTES;

// A foreground upload of a few megabytes; no background uploader to wait for.
export const IMAGE_UPLOAD_URL_TTL_SECONDS = 900; // 15 minutes to upload an image

export const IMAGE_DOWNLOAD_URL_TTL_SECONDS = 900; // 15 minutes to download an image

// An uploaded object can be confirmed for this long. Uploads are stateless, so
// until the confirm nothing references the object; the window is what lets the
// orphan reconciler tell an upload still in progress from an abandoned one.
export const IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS = 3600;

// The orphan reconciler never touches an image younger than this, whatever its
// configured minimum age. Twice the confirm window, so a confirm that verified
// an object at the end of the window has long since written its row.
export const IMAGE_ORPHAN_MIN_AGE_MS = 2 * IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS * 1000;

/** `{prefix}{ownerId}/{uploadId}`; the prefix ends with "/" (e.g. `avatars/`). */
export const buildImageS3Key = (prefix: string, ownerId: string, uploadId: string): string =>
  `${prefix}${ownerId}/${uploadId}`;

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Matches exactly the keys `buildImageS3Key` mints under `prefix`. */
export const buildImageS3KeyPattern = (prefix: string): RegExp => {
  const escapedPrefix = prefix.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&");
  return new RegExp(`^${escapedPrefix}${S3_KEY_UUID_SEGMENT}/${S3_KEY_UUID_SEGMENT}$`, "i");
};

export const IMAGE_UPLOAD_ERRORS = {
  UNSUPPORTED_CONTENT_TYPE: (contentType: string) =>
    `Image content type "${contentType}" is not supported; use one of ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}`,
  INVALID_SIZE: (sizeBytes: number) =>
    `Image size must be a whole number of bytes between 1 and ${MAX_IMAGE_SIZE_BYTES}, received ${sizeBytes}`,
  UPLOAD_NOT_FOUND: (uploadId: string) =>
    `No uploaded image found for upload with ID "${uploadId}"; upload the file before confirming`,
  UPLOAD_EXPIRED: (uploadId: string) =>
    `Upload with ID "${uploadId}" was not confirmed in time; request a new upload URL`,
  UPLOAD_REJECTED: (uploadId: string) =>
    `Uploaded image for upload with ID "${uploadId}" has an unsupported type or size and was discarded`,
};
