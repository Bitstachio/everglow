import { createApiError } from "@/lib/api/errors";
import { uploadEventPhotos, type EventPhotoFile } from "./upload-event-photos";

const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
}));

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
/** Upload URLs whose PUT storage refuses. */
let refusedUploadUrls = new Set<string>();

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
  fetchMock.mockReset().mockImplementation(async (url: string, init?: { method?: string }) => {
    if (init?.method === "PUT") return { ok: !refusedUploadUrls.has(url), status: 403 };
    return { blob: async () => new Blob(["abc"]) };
  });
  globalThis.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const mintedBatchSizes = () =>
  mockCreateUploadUrls.mock.calls.map(([request]) => (request as { body: { files: unknown[] } }).body.files.length);

test("uploads a large selection in batches of 20, one after another, with one progress count", async () => {
  const onProgress = jest.fn();

  const result = await uploadEventPhotos("event-1", photoFiles(45), { onProgress });

  expect(result).toEqual({ total: 45, uploaded: 45, error: null });
  expect(mintedBatchSizes()).toEqual([20, 20, 5]);
  expect(mockCreateUploadUrls).toHaveBeenNthCalledWith(1, {
    path: { eventId: "event-1" },
    body: { files: Array.from({ length: 20 }, () => ({ contentType: "image/jpeg", sizeBytes: 3 })) },
    throwOnError: true,
  });
  expect(mockConfirmUploads).toHaveBeenCalledTimes(3);
  expect(mockConfirmUploads.mock.calls[2][0].body.photoIds).toHaveLength(5);
  expect(onProgress).toHaveBeenNthCalledWith(1, { done: 0, total: 45 });
  expect(onProgress).toHaveBeenLastCalledWith({ done: 45, total: 45 });
  const counts = onProgress.mock.calls.map(([progress]) => progress.done);
  expect(counts).toEqual([...counts].sort((a, b) => a - b));
});

test.each(["EVENT_STORAGE_LIMIT_REACHED", "EVENT_GALLERY_CLOSED"])(
  "stops at a batch refused with %s and reports what was uploaded before it",
  async (code) => {
    const refusal = createApiError("Refused", { status: 403, code });
    mockCreateUploadUrls.mockImplementationOnce(mintSlots).mockRejectedValueOnce(refusal);

    const result = await uploadEventPhotos("event-1", photoFiles(45));

    expect(result).toEqual({ total: 45, uploaded: 20, error: refusal });
    expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
    expect(mockConfirmUploads).toHaveBeenCalledTimes(1);
  },
);

test("retries a batch once after a storage reservation conflict", async () => {
  const conflict = createApiError("Conflict", { status: 409, code: "STORAGE_RESERVATION_CONFLICT" });
  mockCreateUploadUrls.mockRejectedValueOnce(conflict);

  await expect(uploadEventPhotos("event-1", photoFiles(2))).resolves.toEqual({ total: 2, uploaded: 2, error: null });
  expect(mockCreateUploadUrls).toHaveBeenCalledTimes(2);
});

test("stops when the retried batch conflicts again", async () => {
  const conflict = createApiError("Conflict", { status: 409, code: "STORAGE_RESERVATION_CONFLICT" });
  mockCreateUploadUrls.mockRejectedValue(conflict);

  await expect(uploadEventPhotos("event-1", photoFiles(2))).resolves.toEqual({
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

  const result = await uploadEventPhotos("event-1", photoFiles(2), { sleep });

  expect(result).toEqual({ total: 2, uploaded: 2, error: null });
  expect(sleep.mock.calls).toEqual([[37_000], [5_000]]);
});

test("gives up after waiting out three 429s in a row", async () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const rateLimited = createApiError("Slow down", { status: 429, retryAfterSeconds: 1 });
  mockCreateUploadUrls.mockRejectedValue(rateLimited);

  const result = await uploadEventPhotos("event-1", photoFiles(2), { sleep });

  expect(result).toEqual({ total: 2, uploaded: 0, error: rateLimited });
  expect(sleep).toHaveBeenCalledTimes(3);
});

test("counts a file that fails its PUT or confirm and carries on with the rest", async () => {
  refusedUploadUrls.add("https://upload.example.com/photo-1");
  mockConfirmUploads.mockImplementation(({ body }: { body: { photoIds: string[] } }) =>
    Promise.resolve({
      data: {
        data: body.photoIds.map((photoId) => ({ photoId, status: photoId === "photo-2" ? "MISSING" : "READY" })),
      },
    }),
  );

  const result = await uploadEventPhotos("event-1", photoFiles(4));

  expect(result).toEqual({ total: 4, uploaded: 2, error: null });
  expect(mockConfirmUploads).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { photoIds: ["photo-0", "photo-2", "photo-3"] },
    throwOnError: true,
  });
});

test("does not PUT a file whose bytes no longer match the size its URL was signed for", async () => {
  const result = await uploadEventPhotos("event-1", photoFiles(1, 99));

  expect(result).toEqual({ total: 1, uploaded: 0, error: null });
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  expect(mockConfirmUploads).not.toHaveBeenCalled();
});

test("retries a confirm whose response was lost, and counts the batch as failed if it is lost again", async () => {
  mockConfirmUploads.mockRejectedValueOnce(new Error("Network unavailable"));
  await expect(uploadEventPhotos("event-1", photoFiles(2))).resolves.toEqual({ total: 2, uploaded: 2, error: null });
  expect(mockConfirmUploads).toHaveBeenCalledTimes(2);

  mockConfirmUploads.mockReset().mockRejectedValue(new Error("Network unavailable"));
  await expect(uploadEventPhotos("event-1", photoFiles(2))).resolves.toEqual({ total: 2, uploaded: 0, error: null });
});
