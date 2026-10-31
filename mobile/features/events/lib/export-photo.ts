import { File, Paths } from "expo-file-system";
import type { PhotoResponseDto } from "../types";

const extensions: Record<PhotoResponseDto["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
let sequence = 0;

/** Each export owns its temporary file, including a failed or cancelled download. */
export const downloadExportPhoto = async (photo: PhotoResponseDto) => {
  const file = new File(Paths.cache, `everglow-export-${Date.now()}-${sequence++}.${extensions[photo.contentType]}`);
  try {
    return await File.downloadFileAsync(photo.url, file, { idempotent: true });
  } catch (error) {
    discardExportFile(file);
    throw error;
  }
};

export const discardExportFile = (file: File) => {
  try {
    file.delete();
  } catch {
    /* The OS may already have evicted this cache file. */
  }
};
