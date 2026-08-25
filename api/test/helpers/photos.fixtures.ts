import { Photo, PhotoStatus } from "generated/prisma/client";
import { TEST_EVENT_ID } from "./events.fixtures";
import { TEST_NOW, TEST_USER_ID } from "./users.fixtures";

export const TEST_PHOTO_ID = "bbbbbbbb-1111-4222-8333-bbbbbbbbbbbb";
export const TEST_OTHER_PHOTO_ID = "cccccccc-1111-4222-8333-cccccccccccc";
export const TEST_SIGNED_PUT_URL = "https://s3.example.com/signed-put";
export const TEST_SIGNED_GET_URL = "https://s3.example.com/signed-get";

export const buildPhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: TEST_PHOTO_ID,
  eventId: TEST_EVENT_ID,
  addedById: TEST_USER_ID,
  s3Key: `photos/${TEST_EVENT_ID}/${TEST_PHOTO_ID}`,
  contentType: "image/jpeg",
  sizeBytes: 1024,
  status: PhotoStatus.READY,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
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
