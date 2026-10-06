import { photosControllerConfirmUploads, photosControllerCreateUploadUrls } from "@/lib/api/generated";
import type { ConfirmPhotoResultDto, UploadFileDto, UploadSlotResponseDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { getErrorCode, isApiError } from "@/lib/api/errors";
import { File } from "expo-file-system";
import { FileSystemSessionType, FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";

/** The API's `MAX_UPLOAD_BATCH_SIZE`: files per mint and per confirm. */
export const PHOTO_UPLOAD_BATCH_SIZE = 20;

/** PUTs in flight at once inside a batch. */
const PUT_CONCURRENCY = 4;

/** 429s waited out per batch before the upload gives up. */
const MAX_RATE_LIMIT_WAITS = 3;

/** The API always sends Retry-After on a 429 (`docs/rate-limiting.md`); this covers a proxy that drops it. */
const DEFAULT_RETRY_AFTER_SECONDS = 5;

export type EventPhotoFile = {
  uri: string;
  contentType: UploadFileDto["contentType"];
  /** The exact length of the file's bytes: the upload URL is signed for it. */
  sizeBytes: number;
};

export type EventPhotoUploadProgress = {
  /** Files whose upload has finished, successfully or not. */
  done: number;
  total: number;
};

export type EventPhotoUploadResult = {
  total: number;
  /** Photos confirmed READY and now in the gallery. */
  uploaded: number;
  /** The files that did not end up READY, in the order given: refused, lost, or never tried. */
  failed: EventPhotoFile[];
  /** Why the upload stopped before trying every file, or null when it tried them all. */
  error: unknown;
};

type UploadEventPhotosOptions = {
  onProgress?: (progress: EventPhotoUploadProgress) => void;
  /** Waits out a 429; replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The spec documents these responses as one object, but both endpoints return
// one entry per file (EV-112).
const toList = <T>(raw: T | T[] | null | undefined): T[] => (Array.isArray(raw) ? raw : raw ? [raw] : []);

/**
 * Mints one slot per file. A reservation conflict means concurrent batches for
 * this gallery kept colliding, so the batch is retried once; a 429 is waited
 * out. Everything else, a full or closed gallery included, is thrown.
 */
const mintSlots = async (
  eventId: string,
  files: EventPhotoFile[],
  sleep: (ms: number) => Promise<void>,
): Promise<UploadSlotResponseDto[]> => {
  let conflictRetried = false;
  let rateLimitWaits = 0;

  for (;;) {
    try {
      const { data } = await photosControllerCreateUploadUrls({
        path: { eventId },
        body: { files: files.map(({ contentType, sizeBytes }) => ({ contentType, sizeBytes })) },
        throwOnError: true,
      });
      return toList(unwrapEnvelope(data));
    } catch (error) {
      if (getErrorCode(error) === "STORAGE_RESERVATION_CONFLICT" && !conflictRetried) {
        conflictRetried = true;
        continue;
      }
      if (isApiError(error) && error.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        rateLimitWaits += 1;
        await sleep((error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000);
        continue;
      }
      throw error;
    }
  }
};

/** Confirm is idempotent, so a lost response is retried once. Ids it cannot confirm count as failed. */
const confirmSlots = async (eventId: string, photoIds: string[]): Promise<ConfirmPhotoResultDto[]> => {
  const confirm = async () => {
    const { data } = await photosControllerConfirmUploads({
      path: { eventId },
      body: { photoIds },
      throwOnError: true,
    });
    return toList(unwrapEnvelope(data));
  };

  try {
    return await confirm();
  } catch {
    return confirm().catch(() => []);
  }
};

/**
 * PUTs one file to its slot on the OS background uploader (`docs/photos-architecture.md`):
 * iOS keeps sending it while the app is suspended, where a `fetch` would be
 * cancelled, and the promise settles once the app is back. False when it
 * cannot: the bytes changed since they were measured, or storage refused them.
 */
const putToSlot = async (file: EventPhotoFile, slot: UploadSlotResponseDto): Promise<boolean> => {
  try {
    if (new File(file.uri).size !== file.sizeBytes) return false;
    const { status } = await uploadAsync(slot.uploadUrl, file.uri, {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystemSessionType.BACKGROUND,
      headers: { "Content-Type": file.contentType },
    });
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
};

const runPooled = async (tasks: (() => Promise<void>)[], concurrency: number) => {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
};

/**
 * Uploads event photos in batches of PHOTO_UPLOAD_BATCH_SIZE, one batch after
 * another (`docs/uploads.md`): mint the batch, PUT each file, confirm the ones
 * that landed. A file that fails its PUT or confirm is returned in `failed` and
 * the rest go on; a mint that fails after its retries stops the upload, since
 * every later batch would be refused the same way (a full or closed gallery),
 * and the files it never tried are returned in `failed` too.
 */
export const uploadEventPhotos = async (
  eventId: string,
  files: EventPhotoFile[],
  { onProgress, sleep = defaultSleep }: UploadEventPhotosOptions = {},
): Promise<EventPhotoUploadResult> => {
  const total = files.length;
  let done = 0;
  const ready = new Set<EventPhotoFile>();
  const result = (error: unknown): EventPhotoUploadResult => ({
    total,
    uploaded: ready.size,
    failed: files.filter((file) => !ready.has(file)),
    error,
  });
  onProgress?.({ done, total });

  for (let start = 0; start < total; start += PHOTO_UPLOAD_BATCH_SIZE) {
    const batch = files.slice(start, start + PHOTO_UPLOAD_BATCH_SIZE);

    let slots: UploadSlotResponseDto[];
    try {
      slots = await mintSlots(eventId, batch, sleep);
    } catch (error) {
      return result(error);
    }

    const putFiles = new Map<string, EventPhotoFile>();
    await runPooled(
      batch.map((file, index) => async () => {
        const slot = slots[index];
        if (slot && (await putToSlot(file, slot))) putFiles.set(slot.photoId, file);
        done += 1;
        onProgress?.({ done, total });
      }),
      PUT_CONCURRENCY,
    );

    if (putFiles.size > 0) {
      const confirmed = await confirmSlots(eventId, [...putFiles.keys()]);
      for (const { photoId, status } of confirmed) {
        const file = putFiles.get(photoId);
        if (file && status === "READY") ready.add(file);
      }
    }
  }

  return result(null);
};
