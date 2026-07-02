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

export const buildPhotoS3Key = (galleryId: string, photoId: string): string => `photos/${galleryId}/${photoId}`;

export const PHOTO_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(photoEntity, "ID", id),
  CREATE_FORBIDDEN: (galleryId: string) => `Not authorized to upload photos to gallery with ID "${galleryId}"`,
  READ_FORBIDDEN: (photoId: string) => `Not authorized to read photo with ID "${photoId}"`,
  DELETE_FORBIDDEN: (photoId: string) => `Not authorized to delete photo with ID "${photoId}"`,
};
