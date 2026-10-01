import { isApiError } from "./errors";
import { uploadFile } from "./upload-file";

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const future = () => new Date(Date.now() + 60_000).toISOString();

test("mints for the bytes read from the file, PUTs them typed, and returns the slot", async () => {
  const fileBlob = new Blob(["avatar-bytes"]);
  fetchMock.mockResolvedValueOnce({ blob: async () => fileBlob }).mockResolvedValueOnce({ ok: true });
  const slot = { uploadId: "upload-1", uploadUrl: "https://upload.example.com/avatar", expiresAt: future() };
  const mint = jest.fn().mockResolvedValue(slot);

  await expect(uploadFile({ uri: "file://avatar.jpg", contentType: "image/jpeg", mint })).resolves.toBe(slot);

  expect(mint).toHaveBeenCalledWith({ contentType: "image/jpeg", sizeBytes: fileBlob.size });
  const [url, init] = fetchMock.mock.calls[1];
  expect(url).toBe("https://upload.example.com/avatar");
  expect(init.method).toBe("PUT");
  expect(init.headers).toEqual({ "Content-Type": "image/jpeg" });
  expect(init.body.type).toBe("image/jpeg");
  expect(init.body.size).toBe(fileBlob.size);
});

test("does not PUT to a URL that has already expired", async () => {
  fetchMock.mockResolvedValueOnce({ blob: async () => new Blob(["x"]) });
  const mint = jest.fn().mockResolvedValue({
    uploadUrl: "https://upload.example.com/avatar",
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });

  await expect(uploadFile({ uri: "file://avatar.jpg", contentType: "image/jpeg", mint })).rejects.toThrow(
    "The upload link expired",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("reports the storage status when the PUT is refused", async () => {
  fetchMock.mockResolvedValueOnce({ blob: async () => new Blob(["x"]) }).mockResolvedValueOnce({
    ok: false,
    status: 403,
  });
  const mint = jest.fn().mockResolvedValue({ uploadUrl: "https://upload.example.com/avatar", expiresAt: future() });

  const error = await uploadFile({ uri: "file://avatar.jpg", contentType: "image/jpeg", mint }).catch((e) => e);

  expect(isApiError(error)).toBe(true);
  expect(error.message).toBe("Upload to storage failed (403)");
  expect(error.status).toBe(403);
});
