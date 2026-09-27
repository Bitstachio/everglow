import { buildPhoto } from "../testing/fixtures";
import { uploadEventPhoto } from "./upload-event-photo";

const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();
const mockFindOne = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
  photosControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockCreateUploadUrls.mockReset();
  mockConfirmUploads.mockReset();
  mockFindOne.mockReset();
  globalThis.fetch = jest.fn() as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("mints a slot, uploads the blob, confirms, and returns the photo", async () => {
  const photo = buildPhoto({ id: "photo-new" });
  mockCreateUploadUrls.mockResolvedValue({
    data: {
      data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }],
    },
  });
  mockConfirmUploads.mockResolvedValue({ data: { data: null } });
  mockFindOne.mockResolvedValue({ data: { data: photo } });

  const blob = new Blob(["image-bytes"], { type: "image/jpeg" });
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ blob: async () => blob }).mockResolvedValueOnce({ ok: true });

  await expect(uploadEventPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/jpeg", 2048)).resolves.toEqual(
    photo,
  );

  expect(mockCreateUploadUrls).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { files: [{ contentType: "image/jpeg", sizeBytes: 2048 }] },
    throwOnError: true,
  });
  expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "file://photo.jpg");
  expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "https://upload.example.com/slot", {
    body: blob,
    headers: { "Content-Type": "image/jpeg" },
    method: "PUT",
  });
  expect(mockConfirmUploads).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { photoIds: ["photo-new"] },
    throwOnError: true,
  });
  expect(mockFindOne).toHaveBeenCalledWith({ path: { photoId: "photo-new" }, throwOnError: true });
});

test("normalizes unknown image types to image/jpeg", async () => {
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockResolvedValue({ data: { data: null } });
  mockFindOne.mockResolvedValue({ data: { data: buildPhoto() } });
  (globalThis.fetch as jest.Mock)
    .mockResolvedValueOnce({ blob: async () => new Blob(["x"]) })
    .mockResolvedValueOnce({ ok: true });

  await uploadEventPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/jpg", 100);

  expect(mockCreateUploadUrls).toHaveBeenCalledWith(
    expect.objectContaining({
      body: { files: [{ contentType: "image/jpeg", sizeBytes: 100 }] },
    }),
  );
});

test("fails when storage rejects the PUT", async () => {
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  (globalThis.fetch as jest.Mock)
    .mockResolvedValueOnce({ blob: async () => new Blob(["x"]) })
    .mockResolvedValueOnce({ ok: false, status: 403 });

  await expect(uploadEventPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/png", 100)).rejects.toThrow(
    "Upload to storage failed (403)",
  );
  expect(mockConfirmUploads).not.toHaveBeenCalled();
});
