import {
  photosControllerConfirmUploads,
  photosControllerCreateUploadUrls,
  photosControllerFindOne,
} from "@/lib/api/generated";
import type { UploadFileDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { PhotoResponseDto } from "../types";

const normalizeContentType = (fileType: string): UploadFileDto["contentType"] => {
  if (fileType === "image/jpeg" || fileType === "image/png" || fileType === "image/webp") {
    return fileType;
  }
  if (fileType === "image/heic" || fileType === "image/heif") {
    return fileType;
  }
  return "image/jpeg";
};

/** Mint a slot, PUT the file to storage, confirm, then return the photo. */
export const uploadEventPhoto = async (
  eventId: string,
  fileUri: string,
  _fileName: string,
  fileType: string,
  sizeBytes: number,
): Promise<PhotoResponseDto> => {
  const contentType = normalizeContentType(fileType);
  const { data: slotsBody } = await photosControllerCreateUploadUrls({
    path: { eventId },
    body: { files: [{ contentType, sizeBytes }] },
    throwOnError: true,
  });

  const raw = unwrapEnvelope(slotsBody);
  const slots = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const slot = slots[0];
  if (!slot) {
    throw new Error("No upload slot returned from the API");
  }

  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(slot.uploadUrl, {
    body: blob,
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

  const { data } = await photosControllerFindOne({ path: { photoId: slot.photoId }, throwOnError: true });
  return unwrapEnvelope(data);
};
