import { createApiError } from "@/lib/api/errors";
import {
  putEventPhoto,
  uploadEventPhotos,
  type EventPhotoFile,
  type EventPhotoUpdate,
  type PutEventPhoto,
} from "./upload-event-photos";

const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
const mockFileSize = jest.fn();
const mockUploadAsync = jest.fn();
const mockUploadTask = jest.fn();
jest.mock("expo-file-system", () => ({
  File: jest
    .fn()
    .mockImplementation((uri: string) => ({ uri, size: mockFileSize(uri), exists: mockFileSize(uri) >= 0 })),
  UploadTask: jest.fn().mockImplementation((...args: unknown[]) => {
    mockUploadTask(...args);
    return { uploadAsync: () => mockUploadAsync() };
  }),
  UploadType: { BINARY_CONTENT: 0 },
}));
jest.mock("@/lib/api/generated", () => ({
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
}));

/** Upload URLs whose PUT storage refuses. */
let refusedUploadUrls = new Set<string>();
const put = jest.fn<ReturnType<PutEventPhoto>, Parameters<PutEventPhoto>>();

const photoFiles = (count: number, sizeBytes = 3): EventPhotoFile[] =>
  Array.from({ length: count }, (_, index) => ({
    uri: `file://photo-${index}.jpg`,
    contentType: "image/jpeg",
    sizeBytes,
  }));

/** One slot per declared file, with ids that carry on across batches. */
let mintedSoFar = 0;
const mintSlots = ({ body }: { body: { files: unknown[] } }) => {
  const slots = body.files.map(() => {
    const photoId = `photo-${mintedSoFar++}`;
    return { photoId, uploadUrl: `https://upload.example.com/${photoId}` };
  });
  return Promise.resolve({ data: { data: slots } });
};

const confirmAllReady = ({ body }: { body: { photoIds: string[] } }) =>
  Promise.resolve({ data: { data: body.photoIds.map((photoId) => ({ photoId, status: "READY" })) } });

beforeEach(() => {
  mintedSoFar = 0;
  refusedUploadUrls = new Set();
  mockCreateUploadUrls.mockReset().mockImplementation(mintSlots);
  mockConfirmUploads.mockReset().mockImplementation(confirmAllReady);
  put.mockReset().mockImplementation(async (file, slot, { onBytes }) => {
    if (refusedUploadUrls.has(slot.uploadUrl)) throw createApiError("Forbidden", { status: 403 });
    onBytes(file.sizeBytes);
  });
});

/** Each file's last update, by index. */
const lastUpdates = (onFile: jest.Mock) => {
  const updates = new Map<number, EventPhotoUpdate>();
  for (const [index, update] of onFile.mock.calls as [number, EventPhotoUpdate][]) updates.set(index, update);
  return [...updates.entries()].sort(([a], [b]) => a - b).map(([, update]) => update);
};

const mintedBatchSizes = () =>
  mockCreateUploadUrls.mock.calls.map(([request]) => (request as { body: { files: unknown[] } }).body.files.length);

test("uploads a large selection in batches of 20, one after another, and develops every file", async () => {
  const onFile = jest.fn();

  const result = await uploadEventPhotos("event-1", photoFiles(45), { onFile, put });

  expect(result).toEqual({ total: 45, uploaded: 45, error: null });
  expect(mintedBatchSizes()).toEqual([20, 20, 5]);
  expect(mockCreateUploadUrls).toHaveBeenNthCalledWith(1, {
    path: { eventId: "event-1" },
    body: { files: Array.from({ length: 20 }, () => ({ contentType: "image/jpeg", sizeBytes: 3 })) },
    throwOnError: true,
  });
  expect(mockConfirmUploads).toHaveBeenCalledTimes(3);
  expect(mockConfirmUploads.mock.calls[2][0].body.photoIds).toHaveLength(5);
  expect(lastUpdates(onFile)).toEqual(
    Array.from({ length: 45 }, (_, index) => ({ kind: "developed", photoId: `photo-${index}` })),
  );
  expect(onFile).toHaveBeenCalledWith(0, { kind: "sending", bytesSent: 3 });
});

test("reports each batch's photo ids as soon as they're minted", async () => {
  const onMinted = jest.fn();

  await uploadEventPhotos("event-1", photoFiles(22), { onMinted, put });

  expect(onMinted).toHaveBeenCalledTimes(2);
  expect(onMinted.mock.calls[1][0]).toEqual([
    { index: 20, photoId: "photo-20" },
    { index: 21, photoId: "photo-21" },
  ]);
});

test.each([
  ["EVENT_STORAGE_LIMIT_REACHED", "noRoom"],
  ["EVENT_GALLERY_CLOSED", "closed"],
])("stops at a batch refused with %s and fails the rest as %s", async (code, reason) => {
  const refusal = createApiError("Refused", { status: 403, code });
  mockCreateUploadUrls.mockImplementationOnce(mintSlots).mockRejectedValueOnce(refusal);
  const onFile = jest.fn();

  const result = await uploadEventPhotos("event-1", photoFiles(45), { onFile, put });

  expect(result).toEqual({ total: 45, uploaded: 20, error: refusal });
  const updates = lastUpdates(onFile);
  expect(updates.slice(0, 20).every((update) => update.kind === "developed")).toBe(true);
  expect(updates.slice(20)).toEqual(Array.from({ length: 25 }, () => ({ kind: "failed", reason })));
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
  expect(mockConfirmUploads).toHaveBeenCalledTimes(1);
});

test("retries a batch once after a storage reservation conflict", async () => {
  const conflict = createApiError("Conflict", { status: 409, code: "STORAGE_RESERVATION_CONFLICT" });
  mockCreateUploadUrls.mockRejectedValueOnce(conflict);

  await expect(uploadEventPhotos("event-1", photoFiles(2), { put })).resolves.toEqual({
    total: 2,
    uploaded: 2,
    error: null,
  });
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
});

test("stops when the retried batch conflicts again", async () => {
  const conflict = createApiError("Conflict", { status: 409, code: "STORAGE_RESERVATION_CONFLICT" });
  mockCreateUploadUrls.mockRejectedValue(conflict);

  await expect(uploadEventPhotos("event-1", photoFiles(2), { put })).resolves.toEqual({
    total: 2,
    uploaded: 0,
    error: conflict,
  });
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
});

test("waits out a 429 for Retry-After and carries on", async () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  mockCreateUploadUrls
    .mockRejectedValueOnce(createApiError("Slow down", { status: 429, retryAfterSeconds: 37 }))
    .mockRejectedValueOnce(createApiError("Slow down", { status: 429 }));

  const result = await uploadEventPhotos("event-1", photoFiles(2), { sleep, put });

  expect(result).toEqual({ total: 2, uploaded: 2, error: null });
  expect(sleep.mock.calls).toEqual([[37_000], [5_000]]);
});

test("gives up after waiting out three 429s in a row", async () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const rateLimited = createApiError("Slow down", { status: 429, retryAfterSeconds: 1 });
  mockCreateUploadUrls.mockRejectedValue(rateLimited);

  const result = await uploadEventPhotos("event-1", photoFiles(2), { sleep, put });

  expect(result).toEqual({ total: 2, uploaded: 0, error: rateLimited });
  expect(sleep).toHaveBeenCalledTimes(3);
});

test("fails a file refused at its PUT or confirm and carries on with the rest", async () => {
  refusedUploadUrls.add("https://upload.example.com/photo-1");
  mockConfirmUploads.mockImplementation(({ body }: { body: { photoIds: string[] } }) =>
    Promise.resolve({
      data: {
        data: body.photoIds.map((photoId) => ({ photoId, status: photoId === "photo-2" ? "MISSING" : "READY" })),
      },
    }),
  );

  const onFile = jest.fn();
  const result = await uploadEventPhotos("event-1", photoFiles(4), { onFile, put });

  expect(result).toEqual({ total: 4, uploaded: 2, error: null });
  expect(lastUpdates(onFile)).toEqual([
    { kind: "developed", photoId: "photo-0" },
    { kind: "failed", reason: "refused" },
    { kind: "failed", reason: "refused" },
    { kind: "developed", photoId: "photo-3" },
  ]);
  expect(mockConfirmUploads).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { photoIds: ["photo-0", "photo-2", "photo-3"] },
    throwOnError: true,
  });
});

test("fails a file whose connection dropped as connection, so it can be retried", async () => {
  put.mockImplementationOnce(async () => {
    throw new TypeError("Network request failed");
  });
  const onFile = jest.fn();

  const result = await uploadEventPhotos("event-1", photoFiles(2), { onFile, put });

  expect(result).toEqual({ total: 2, uploaded: 1, error: null });
  expect(lastUpdates(onFile)[0]).toEqual({ kind: "failed", reason: "connection" });
});

test("cancels the files not yet sent when the signal aborts", async () => {
  const controller = new AbortController();
  put.mockImplementationOnce(async (file, _slot, { onBytes }) => {
    onBytes(file.sizeBytes);
    controller.abort();
  });
  const onFile = jest.fn();

  const result = await uploadEventPhotos("event-1", photoFiles(25), { onFile, put, signal: controller.signal });

  const updates = lastUpdates(onFile);
  expect(updates[0]).toEqual({ kind: "developed", photoId: "photo-0" });
  expect(updates.slice(4)).toEqual(Array.from({ length: 21 }, () => ({ kind: "failed", reason: "cancelled" })));
  expect(result.uploaded).toBe(1);
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(1);
});

test("retries a confirm whose response was lost, and counts the batch as failed if it is lost again", async () => {
  mockConfirmUploads.mockRejectedValueOnce(new Error("Network unavailable"));
  await expect(uploadEventPhotos("event-1", photoFiles(2), { put })).resolves.toEqual({
    total: 2,
    uploaded: 2,
    error: null,
  });
  expect(mockConfirmUploads).toHaveBeenCalledTimes(2);

  mockConfirmUploads.mockReset().mockRejectedValue(new Error("Network unavailable"));
  await expect(uploadEventPhotos("event-1", photoFiles(2), { put })).resolves.toEqual({
    total: 2,
    uploaded: 0,
    error: expect.any(Error),
  });
});

describe("putEventPhoto", () => {
  const slot = { photoId: "photo-0", uploadUrl: "https://upload.example.com/photo-0" } as Parameters<PutEventPhoto>[1];
  const [file] = photoFiles(1, 3) as [EventPhotoFile];

  beforeEach(() => {
    mockFileSize.mockReset().mockReturnValue(3);
    mockUploadAsync.mockReset().mockResolvedValue({ status: 200, body: "", headers: {} });
    mockUploadTask.mockReset();
  });

  test("PUTs the file's bytes with its type and reports bytes sent", async () => {
    const onBytes = jest.fn();
    await putEventPhoto(file, slot, { onBytes });

    const [, url, options] = mockUploadTask.mock.calls[0];
    expect(url).toBe(slot.uploadUrl);
    expect(options).toMatchObject({
      sessionType: "background",
      httpMethod: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    options.onProgress({ bytesSent: 2, totalBytes: 3 });
    expect(onBytes).toHaveBeenCalledWith(2);
  });

  test("does not PUT a file whose bytes no longer match the size its URL was signed for", async () => {
    mockFileSize.mockReturnValue(99);
    await expect(putEventPhoto(file, slot, { onBytes: jest.fn() })).rejects.toThrow("changed");
    expect(mockUploadTask).not.toHaveBeenCalled();
  });

  test("keeps an unavailable local photo removable instead of starting a native transfer", async () => {
    mockFileSize.mockReturnValue(-1);
    const onFile = jest.fn();
    await uploadEventPhotos("event-1", [file], { onFile });
    expect(lastUpdates(onFile)).toEqual([{ kind: "failed", reason: "missing" }]);
    expect(mockUploadTask).not.toHaveBeenCalled();
    expect(mockConfirmUploads).not.toHaveBeenCalled();
  });

  test("rejects when storage refuses the bytes, which the upload reports as refused", async () => {
    mockUploadAsync.mockResolvedValue({ status: 403, body: "", headers: {} });
    const onFile = jest.fn();

    const result = await uploadEventPhotos("event-1", [file], { onFile });

    expect(result.uploaded).toBe(0);
    expect(lastUpdates(onFile)).toEqual([{ kind: "failed", reason: "refused" }]);
  });
});

test("cancelling during a rate-limit wait stops retries and reports cancellation", async () => {
  const controller = new AbortController();
  mockCreateUploadUrls.mockRejectedValueOnce(createApiError("Slow down", { status: 429, retryAfterSeconds: 60 }));
  const onFile = jest.fn();
  const sleep = jest.fn(async () => {
    controller.abort();
  });
  await uploadEventPhotos("event-1", photoFiles(2), { sleep, put, onFile, signal: controller.signal });
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(1);
  expect(lastUpdates(onFile)).toEqual([
    { kind: "failed", reason: "cancelled" },
    { kind: "failed", reason: "cancelled" },
  ]);
});

test("ending the owning session never confirms a late completed PUT", async () => {
  const session = new AbortController();
  put.mockImplementationOnce(async () => {
    session.abort();
  });
  await uploadEventPhotos("event-1", photoFiles(1), { put, requestSignal: session.signal });
  expect(mockConfirmUploads).not.toHaveBeenCalled();
});

test("Cancel interrupts the real rate-limit timer without waiting for Retry-After", async () => {
  const controller = new AbortController();
  const started = new Promise<void>((resolve) => {
    mockCreateUploadUrls.mockImplementationOnce(async () => {
      resolve();
      throw createApiError("Slow down", { status: 429, retryAfterSeconds: 60 });
    });
  });
  const run = uploadEventPhotos("event-1", photoFiles(1), { put, signal: controller.signal });
  await started;
  await Promise.resolve();
  controller.abort();
  await expect(run).resolves.toMatchObject({ uploaded: 0 });
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(1);
});

test("reconciles an interrupted upload without creating a duplicate reservation", async () => {
  const onFile = jest.fn();
  const files = photoFiles(1).map((file) => ({ ...file, resumePhotoId: "already-ready" }));
  await expect(uploadEventPhotos("event-1", files, { onFile, put })).resolves.toMatchObject({ uploaded: 1 });
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(onFile).toHaveBeenCalledWith(0, { kind: "developed", photoId: "already-ready" });
});

test("keeps an uncertain confirmation recoverable without minting duplicates", async () => {
  mockConfirmUploads.mockRejectedValue(new TypeError("Offline"));
  const onFile = jest.fn();
  await uploadEventPhotos(
    "event-1",
    photoFiles(1).map((file) => ({ ...file, resumePhotoId: "pending" })),
    { put, onFile },
  );
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
  expect(lastUpdates(onFile)).toEqual([{ kind: "failed", reason: "connection" }]);
});

test.each(["MISSING", "NOT_FOUND", "MISMATCHED"])(
  "mints again only after an explicit %s confirmation verdict",
  async (status) => {
    mockConfirmUploads.mockResolvedValueOnce({ data: { data: [{ photoId: "previous", status }] } });
    await expect(
      uploadEventPhotos(
        "event-1",
        photoFiles(1).map((file) => ({ ...file, resumePhotoId: "previous" })),
        { put },
      ),
    ).resolves.toMatchObject({ uploaded: 1 });
    expect(mockCreateUploadUrls).toHaveBeenCalledTimes(1);
  },
);
