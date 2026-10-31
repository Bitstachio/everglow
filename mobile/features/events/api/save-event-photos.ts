import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { isApiError } from "@/lib/api/errors";
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
const temporaryFile = (photo: PhotoResponseDto, purpose: "photo" | "share") => {
  downloads += 1;
  const prefix = purpose === "share" ? "everglow-share" : "everglow";
  return new File(Paths.cache, `${prefix}-${photo.id}-${downloads}.${EXTENSIONS[photo.contentType]}`);
};

const removeQuietly = (file: File) => {
  try {
    file.delete();
  } catch {
    // Already gone; the cache is the system's to clear anyway.
  }
};

const abortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

/** The frame was deleted, or the caller can no longer see it: the API answers 404. */
export const isGonePhotoError = (error: unknown) => isApiError(error) && error.status === 404;

/**
 * Asks to add to the phone's library without reading it: iOS's add-only
 * prompt, and no media read permission on Android 13+.
 */
export const requestLibraryAddAccess = async () => {
  const { status } = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
  return status === "granted";
};

type DownloadOptions = { signal?: AbortSignal; purpose?: "photo" | "share" };

/**
 * Downloads one frame's original to a temporary file of its own. `signedAt` is
 * when the photo's links were fetched: an older link is renewed first, and a
 * download that fails on a link that looked fresh (an expired or refused link
 * answers 403) is tried once more with a new one. The caller owns the file.
 */
export const downloadEventPhoto = async (
  photo: PhotoResponseDto,
  signedAt: number,
  { signal, purpose = "photo" }: DownloadOptions = {},
): Promise<File> => {
  const download = async (source: PhotoResponseDto) => {
    throwIfAborted(signal);
    const destination = temporaryFile(source, purpose);
    try {
      return await File.downloadFileAsync(source.url, destination, { idempotent: true });
    } catch (error) {
      removeQuietly(destination);
      throw error;
    }
  };
  const linkIsFresh = Date.now() - signedAt < LINK_FRESH_MS;
  let downloaded: File;
  try {
    downloaded = await download(linkIsFresh ? photo : await fetchEventPhoto(photo.id, signal));
  } catch (error) {
    if (!linkIsFresh || signal?.aborted || isGonePhotoError(error)) throw error;
    downloaded = await download(await fetchEventPhoto(photo.id, signal));
  }
  if (signal?.aborted) {
    // Stopped while the bytes arrived: nothing gets to use them.
    removeQuietly(downloaded);
    throw abortError();
  }
  return downloaded;
};

/**
 * Saves one frame to the phone's library. A save stopped through `signal`
 * never reaches the library. The library keeps its own copy, so the download goes.
 */
export const saveEventPhoto = async (photo: PhotoResponseDto, signedAt: number, signal?: AbortSignal) => {
  const downloaded = await downloadEventPhoto(photo, signedAt, { signal });
  try {
    throwIfAborted(signal);
    await MediaLibrary.Asset.create(downloaded.uri);
  } finally {
    removeQuietly(downloaded);
  }
};

/**
 * Files handed to the share sheet. Android's receiving app can read them after
 * `Share.open` resolves, so they stay until the next share starts.
 */
let sharedFiles: File[] = [];

/** Downloads frames for the share sheet, after removing what the previous share left behind. */
export const prepareSharedPhotos = async (
  photos: { photo: PhotoResponseDto; signedAt: number }[],
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number) => void } = {},
): Promise<File[]> => {
  sharedFiles.forEach(removeQuietly);
  sharedFiles = [];
  const files: File[] = [];
  try {
    for (const { photo, signedAt } of photos) {
      files.push(await downloadEventPhoto(photo, signedAt, { signal, purpose: "share" }));
      onProgress?.(files.length);
    }
  } catch (error) {
    // No share sheet saw these, so they go now.
    files.forEach(removeQuietly);
    throw error;
  }
  sharedFiles = files;
  return files;
};
