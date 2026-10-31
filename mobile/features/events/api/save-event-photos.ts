import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { fetchEventPhoto } from "./queries";
import type { PhotoResponseDto } from "../types";

/**
 * Download links are signed for 15 minutes (the API's `DOWNLOAD_URL_TTL_SECONDS`).
 * A link older than this is renewed before downloading, so a large original
 * doesn't outlive its link halfway through.
 */
export const LINK_FRESH_MS = 10 * 60 * 1000;

// Original S3 keys have no suffix. Photos detects the media type from the local filename.
const EXTENSIONS: Record<PhotoResponseDto["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

let downloads = 0;

/** A temporary file of its own for every download, so two saves of one frame never share or delete each other's. */
const temporaryFile = (photo: PhotoResponseDto) => {
  downloads += 1;
  return new File(Paths.cache, `everglow-${photo.id}-${downloads}.${EXTENSIONS[photo.contentType]}`);
};

const download = (photo: PhotoResponseDto) =>
  File.downloadFileAsync(photo.url, temporaryFile(photo), { idempotent: true });

const removeQuietly = (file: File) => {
  try {
    file.delete();
  } catch {
    // Already gone; the cache is the system's to clear anyway.
  }
};

/**
 * Asks to add to the phone's library without reading it: iOS's add-only
 * prompt, and no media read permission on Android 13+.
 */
export const requestLibraryAddAccess = async () => {
  const { status } = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
  return status === "granted";
};

/**
 * Saves one frame to the phone's library. `signedAt` is when the photo's links
 * were fetched: an older link is renewed first, and a download that fails on a
 * link that looked fresh (an expired or refused link answers 403) is tried once
 * more with a new one. The library keeps its own copy, so the download goes.
 */
export const saveEventPhoto = async (photo: PhotoResponseDto, signedAt: number) => {
  const linkIsFresh = Date.now() - signedAt < LINK_FRESH_MS;
  let downloaded: File;
  try {
    downloaded = await download(linkIsFresh ? photo : await fetchEventPhoto(photo.id));
  } catch (error) {
    if (!linkIsFresh) throw error;
    downloaded = await download(await fetchEventPhoto(photo.id));
  }
  try {
    await MediaLibrary.Asset.create(downloaded.uri);
  } finally {
    removeQuietly(downloaded);
  }
};
