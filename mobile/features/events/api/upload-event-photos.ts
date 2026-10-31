import { photosControllerConfirmUploads, photosControllerCreateUploadUrls } from "@/lib/api/generated";
import type { ConfirmPhotoResultDto, UploadFileDto, UploadSlotResponseDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { getErrorCode, isApiError, isConnectionError } from "@/lib/api/errors";
import { File, UploadTask, UploadType } from "expo-file-system";

/** The API's `MAX_UPLOAD_BATCH_SIZE`: files per mint and per confirm. */
export const PHOTO_UPLOAD_BATCH_SIZE = 20;

/** The API's `MAX_PHOTO_SIZE_BYTES`: a larger photo can't be added (08.5). */
export const MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024;

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
  /** Check this prior reservation before minting another after interruption. */
  resumePhotoId?: string;
};

/**
 * Why a file did not make it onto the roll (08.4–08.8):
 * - connection: the request never got an answer; retrying can work
 * - refused: storage or the API turned the file down; retrying can work
 * - noRoom: the roll ran out of room (EVENT_STORAGE_LIMIT_REACHED)
 * - closed: the gallery closed while it was sending (EVENT_GALLERY_CLOSED)
 * - interrupted: the app stopped mid-upload; set when the tray is restored, and
 *   Retry reconciles its reservation before minting again
 * - missing: the local file can no longer be read; it can only be removed
 * - cancelled: "Cancel the rest" stopped it
 */
export type EventPhotoFailure =
  | "connection"
  | "refused"
  | "noRoom"
  | "closed"
  | "interrupted"
  | "missing"
  | "cancelled";

/** What happened to one file, by its index in the list passed in. */
export type EventPhotoUpdate =
  | { kind: "sending"; bytesSent: number }
  | { kind: "developed"; photoId: string }
  | { kind: "failed"; reason: EventPhotoFailure };

type EventPhotoUploadResult = {
  total: number;
  /** Photos confirmed READY and now in the gallery. */
  uploaded: number;
  /** Why the upload stopped before trying every file, or null when it tried them all. */
  error: unknown;
};

/** PUTs a file's bytes to its slot, reporting bytes sent. Rejects when the PUT fails. */
export type PutEventPhoto = (
  file: EventPhotoFile,
  slot: UploadSlotResponseDto,
  options: { onBytes: (bytesSent: number) => void; signal?: AbortSignal },
) => Promise<void>;

type UploadEventPhotosOptions = {
  onFile?: (index: number, update: EventPhotoUpdate) => void;
  /**
   * A batch's slots were minted: each file's photo id, before any bytes are
   * sent. The API lists a batch's photos newest first by id, so this is
   * enough to place them on the sheet where they'll land.
   */
  onMinted?: (minted: { index: number; photoId: string }[]) => void;
  /** Aborting stops the files in flight and leaves the rest unsent. */
  signal?: AbortSignal;
  /** Aborts all API work when the owning session ends, including landed-file confirmation. */
  requestSignal?: AbortSignal;
  /** Waits out a 429; replaced in tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Sends one file; replaced in tests. */
  put?: PutEventPhoto;
};

const checkAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("Upload cancelled");
};

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    checkAborted(signal);
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("Upload cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });

/** Thrown when the PUT got an answer and it was a refusal, so it isn't a lost connection. */
class RefusedUpload extends Error {}
class MissingUploadFile extends Error {}

/**
 * Streams the file from disk with byte progress. iOS keeps the transfer going
 * while the app is in the background, so leaving the roll doesn't stop it.
 */
export const putEventPhoto: PutEventPhoto = async (file, slot, { onBytes, signal }) => {
  if (slot.expiresAt && Date.parse(slot.expiresAt) <= Date.now()) throw new RefusedUpload("Upload link expired");
  const source = new File(file.uri);
  if (source.exists === false) throw new MissingUploadFile("Local photo is no longer available");
  // The URL is signed for an exact Content-Length: bytes that changed since
  // they were measured would be refused by storage anyway.
  if (source.size !== file.sizeBytes) throw new RefusedUpload("File changed since it was measured");

  const task = new UploadTask(source, slot.uploadUrl, {
    httpMethod: "PUT",
    sessionType: "background",
    uploadType: UploadType.BINARY_CONTENT,
    headers: { "Content-Type": file.contentType },
    mimeType: file.contentType,
    onProgress: ({ bytesSent }) => onBytes(bytesSent),
    signal,
  });
  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) throw new RefusedUpload(`Storage refused (${result.status})`);
};

const failureFor = (error: unknown): EventPhotoFailure => {
  const code = getErrorCode(error);
  if (code === "EVENT_GALLERY_CLOSED") return "closed";
  if (code === "EVENT_STORAGE_LIMIT_REACHED") return "noRoom";
  if (error instanceof MissingUploadFile) return "missing";
  if (error instanceof RefusedUpload) return "refused";
  if (isApiError(error)) return isConnectionError(error) ? "connection" : "refused";
  // A PUT or fetch that never got an answer.
  return "connection";
};

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
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
  requestSignal?: AbortSignal,
): Promise<UploadSlotResponseDto[]> => {
  let conflictRetried = false;
  let rateLimitWaits = 0;

  for (;;) {
    checkAborted(signal);
    checkAborted(requestSignal);
    try {
      const { data } = await photosControllerCreateUploadUrls({
        path: { eventId },
        body: { files: files.map(({ contentType, sizeBytes }) => ({ contentType, sizeBytes })) },
        signal: requestSignal ?? signal,
        throwOnError: true,
      });
      return toList(unwrapEnvelope(data));
    } catch (error) {
      checkAborted(signal);
      checkAborted(requestSignal);
      if (getErrorCode(error) === "STORAGE_RESERVATION_CONFLICT" && !conflictRetried) {
        conflictRetried = true;
        continue;
      }
      if (isApiError(error) && error.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        rateLimitWaits += 1;
        await sleep((error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000, signal);
        continue;
      }
      throw error;
    }
  }
};

/** Confirm is idempotent, so a lost response is retried once. Ids it cannot confirm count as failed. */
const confirmSlots = async (
  eventId: string,
  photoIds: string[],
  signal?: AbortSignal,
): Promise<ConfirmPhotoResultDto[]> => {
  const confirm = async () => {
    checkAborted(signal);
    const { data } = await photosControllerConfirmUploads({
      path: { eventId },
      body: { photoIds },
      signal,
      throwOnError: true,
    });
    return toList(unwrapEnvelope(data));
  };

  try {
    return await confirm();
  } catch {
    return confirm();
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
 * that landed. Every file ends with one `developed` or `failed` update. A file
 * that fails its PUT or confirm is reported and the rest go on; a mint that
 * fails after its retries stops the upload, since every later batch would be
 * refused the same way (a full or closed gallery).
 */
const uploadFreshEventPhotos = async (
  eventId: string,
  files: EventPhotoFile[],
  { onFile, onMinted, signal, requestSignal, sleep = defaultSleep, put = putEventPhoto }: UploadEventPhotosOptions = {},
): Promise<EventPhotoUploadResult> => {
  const total = files.length;
  let uploaded = 0;
  const failFrom = (start: number, reason: EventPhotoFailure) => {
    for (let index = start; index < total; index += 1) onFile?.(index, { kind: "failed", reason });
  };

  for (let start = 0; start < total; start += PHOTO_UPLOAD_BATCH_SIZE) {
    if (signal?.aborted) {
      failFrom(start, "cancelled");
      return { total, uploaded, error: null };
    }
    const batch = files.slice(start, start + PHOTO_UPLOAD_BATCH_SIZE);

    let slots: UploadSlotResponseDto[];
    try {
      slots = await mintSlots(eventId, batch, sleep, signal, requestSignal);
    } catch (error) {
      failFrom(start, signal?.aborted || requestSignal?.aborted ? "cancelled" : failureFor(error));
      return { total, uploaded, error };
    }
    onMinted?.(slots.slice(0, batch.length).map((slot, offset) => ({ index: start + offset, photoId: slot.photoId })));

    const landed = new Map<string, number>();
    await runPooled(
      batch.map((file, offset) => async () => {
        const index = start + offset;
        const slot = slots[offset];
        if (signal?.aborted) {
          onFile?.(index, { kind: "failed", reason: "cancelled" });
          return;
        }
        if (!slot) {
          onFile?.(index, { kind: "failed", reason: "refused" });
          return;
        }
        try {
          onFile?.(index, { kind: "sending", bytesSent: 0 });
          await put(file, slot, { onBytes: (bytesSent) => onFile?.(index, { kind: "sending", bytesSent }), signal });
          landed.set(slot.photoId, index);
        } catch (error) {
          onFile?.(index, { kind: "failed", reason: signal?.aborted ? "cancelled" : failureFor(error) });
        }
      }),
      PUT_CONCURRENCY,
    );

    if (landed.size > 0 && !requestSignal?.aborted) {
      try {
        const results = await confirmSlots(eventId, [...landed.keys()], requestSignal);
        const ready = new Set(results.filter((result) => result.status === "READY").map((result) => result.photoId));
        uploaded += ready.size;
        for (const [photoId, index] of landed) {
          onFile?.(index, ready.has(photoId) ? { kind: "developed", photoId } : { kind: "failed", reason: "refused" });
        }
      } catch (error) {
        for (const index of landed.values()) onFile?.(index, { kind: "failed", reason: failureFor(error) });
        failFrom(start + batch.length, failureFor(error));
        return { total, uploaded, error };
      }
    }
  }

  return { total, uploaded, error: null };
};

/** Reconcile an interrupted reservation first: confirm is idempotent, mint is not. */
export const uploadEventPhotos = async (
  eventId: string,
  files: EventPhotoFile[],
  options: UploadEventPhotosOptions = {},
): Promise<EventPhotoUploadResult> => {
  const pending: number[] = [];
  let uploaded = 0;
  const resumed = files.flatMap((file, index) => (file.resumePhotoId ? [{ index, photoId: file.resumePhotoId }] : []));
  for (let start = 0; start < resumed.length; start += PHOTO_UPLOAD_BATCH_SIZE) {
    const batch = resumed.slice(start, start + PHOTO_UPLOAD_BATCH_SIZE);
    try {
      checkAborted(options.signal);
      const results = await confirmSlots(
        eventId,
        batch.map((item) => item.photoId),
        options.requestSignal ?? options.signal,
      );
      const verdicts = new Map(results.map((result) => [result.photoId, result.status]));
      for (const { index, photoId } of batch) {
        const verdict = verdicts.get(photoId);
        if (verdict === "READY") {
          uploaded += 1;
          options.onFile?.(index, { kind: "developed", photoId });
        } else if (verdict) pending.push(index);
        else options.onFile?.(index, { kind: "failed", reason: "connection" });
      }
    } catch (error) {
      const reason = options.signal?.aborted || options.requestSignal?.aborted ? "cancelled" : failureFor(error);
      for (const { index } of batch) options.onFile?.(index, { kind: "failed", reason });
    }
  }
  files.forEach((file, index) => {
    if (!file.resumePhotoId) pending.push(index);
  });
  const result = await uploadFreshEventPhotos(
    eventId,
    pending.map((index) => files[index]!),
    {
      ...options,
      onFile: (index, update) => options.onFile?.(pending[index]!, update),
      onMinted: (slots) => options.onMinted?.(slots.map((slot) => ({ ...slot, index: pending[slot.index]! }))),
    },
  );
  return { ...result, total: files.length, uploaded: uploaded + result.uploaded };
};
