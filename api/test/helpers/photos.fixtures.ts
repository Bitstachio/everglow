import { Photo, PhotoStatus } from "generated/prisma/client";
import { buildPhotoS3Key } from "src/photos/photos.constants";
import { TEST_EVENT_ID } from "./events.fixtures";
import { TEST_NOW, TEST_USER_ID } from "./users.fixtures";

export const TEST_PHOTO_ID = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";
export const TEST_OTHER_PHOTO_ID = "cccccccc-1111-4222-8333-cccccccccccc";
export const TEST_SIGNED_PUT_URL = "https://s3.example.com/signed-put";
export const TEST_SIGNED_GET_URL = "https://s3.example.com/signed-get";
export const TEST_MULTIPART_UPLOAD_ID = "upload-id-e2e";
export const TEST_MULTIPART_SIZE_BYTES = 12 * 1024 * 1024;
export const TEST_MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024;

export const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: TEST_PHOTO_ID,
  eventId: TEST_EVENT_ID,
  addedById: TEST_USER_ID,
  s3Key: buildPhotoS3Key(TEST_USER_ID, TEST_EVENT_ID, TEST_PHOTO_ID),
  contentType: "image/jpeg",
  sizeBytes: 1024,
  status: PhotoStatus.READY,
  multipartUploadId: null,
  multipartPartSizeBytes: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

/** A PENDING row with an open three-part multipart upload (5 MiB, 5 MiB, 2 MiB). */
export const buildMultipartPhoto = (overrides: Partial<Photo> = {}): Photo =>
  buildPhoto({
    status: PhotoStatus.PENDING,
    sizeBytes: TEST_MULTIPART_SIZE_BYTES,
    multipartUploadId: TEST_MULTIPART_UPLOAD_ID,
    multipartPartSizeBytes: TEST_MULTIPART_PART_SIZE_BYTES,
    ...overrides,
  });

export const expectedPhotoResponse = (photo: Photo, url: string) => ({
  id: photo.id,
  eventId: photo.eventId,
  addedById: photo.addedById,
  url,
  contentType: photo.contentType,
  createdAt: photo.createdAt.toISOString(),
});
