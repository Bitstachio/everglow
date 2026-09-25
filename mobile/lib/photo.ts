import {
  photosControllerConfirmUploads,
  photosControllerCreateUploadUrls,
  photosControllerFindOne,
  photosControllerListPhotos,
  photosControllerRemove,
} from "@/lib/api/generated";
import type { PhotoResponseDto, UploadFileDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { getUserEvents } from "@/lib/event";

export type Photo = PhotoResponseDto;

export type { PhotoResponseDto };

const normalizeContentType = (fileType: string): UploadFileDto["contentType"] => {
  if (fileType === "image/jpeg" || fileType === "image/png" || fileType === "image/webp") {
    return fileType;
  }
  if (fileType === "image/heic" || fileType === "image/heif") {
    return fileType;
  }
  return "image/jpeg";
};

export const getPhotosByEvent = async (eventId: string): Promise<PhotoResponseDto[]> => {
  const { data } = await photosControllerListPhotos({ path: { eventId }, throwOnError: true });
  return unwrapEnvelope(data).items;
};

export const getAllPhotosFromUserEvents = async (): Promise<PhotoResponseDto[]> => {
  const events = await getUserEvents();
  const lists = await Promise.all(events.map((event) => getPhotosByEvent(event.id)));
  return lists.flat();
};

export const getPhotoById = async (photoId: string): Promise<PhotoResponseDto> => {
  const { data } = await photosControllerFindOne({ path: { photoId }, throwOnError: true });
  return unwrapEnvelope(data);
};

export const deletePhoto = async (photoId: string): Promise<void> => {
  await photosControllerRemove({ path: { photoId }, throwOnError: true });
};

export const uploadPhoto = async (
  eventId: string,
  fileUri: string,
  _fileName: string,
  fileType: string,
): Promise<PhotoResponseDto> => {
  const contentType = normalizeContentType(fileType);

  // The upload URL is signed for an exact Content-Length, so the size must be
  // that of the bytes we send. The picker's fileSize can describe the original
  // photo rather than the cropped, re-encoded file, which S3 rejects with 403.
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  if (blob.size <= 0) {
    throw new Error("Could not determine file size for upload");
  }

  const { data: slotsBody } = await photosControllerCreateUploadUrls({
    path: { eventId },
    body: { files: [{ contentType, sizeBytes: blob.size }] },
    throwOnError: true,
  });

  const raw = unwrapEnvelope(slotsBody);
  const slots = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const slot = slots[0];
  if (!slot) {
    throw new Error("No upload slot returned from the API");
  }

  // React Native sends a Blob body with the blob's own type as Content-Type,
  // overriding the header below. A blob read from a file:// URI has an empty
  // type, so S3 sees "content-type:" and rejects the signed URL with 403.
  // slice() gives a typed view of the same bytes without copying them.
  const typedBlob = blob.slice(0, blob.size, contentType);

  const uploadResponse = await fetch(slot.uploadUrl, {
    body: typedBlob,
    headers: { "Content-Type": contentType },
    method: "PUT",
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

  await photosControllerConfirmUploads({
    path: { eventId },
    body: { photoIds: [slot.photoId] },
    throwOnError: true,
  });

  return getPhotoById(slot.photoId);
};

/** @deprecated Gallery aggregation helper; prefer listing photos per event. */
export const getEventPhotoCount = async (eventId: string): Promise<number> => {
  const photos = await getPhotosByEvent(eventId);
  return photos.length;
};
