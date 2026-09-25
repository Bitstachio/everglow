import { uploadPhoto } from "./photo";

const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();
const mockFindOne = jest.fn();

jest.mock("@/lib/api/generated", () => ({
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
  photosControllerFindOne: (...args: unknown[]) => mockFindOne(...args),
}));

jest.mock("@/lib/event", () => ({ getUserEvents: jest.fn() }));

const envelope = <T>(data: T) => ({ data: { data, meta: {} } });

/** A Blob as React Native reads one from a file:// URI: the right size, no type. */
const fileBlob = (size: number) => ({
  size,
  type: "",
  slice: (start: number, end: number, contentType: string) => ({ size: end - start, type: contentType }),
});

describe("uploadPhoto", () => {
  const mockFetch = jest.fn();
  const originalFetch = globalThis.fetch;

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    mockCreateUploadUrls
      .mockReset()
      .mockResolvedValue(envelope([{ photoId: "photo-1", uploadUrl: "https://bucket.example.com/upload" }]));
    mockConfirmUploads.mockReset().mockResolvedValue({});
    mockFindOne.mockReset().mockResolvedValue(envelope({ id: "photo-1" }));
    mockFetch
      .mockReset()
      .mockResolvedValueOnce({ blob: async () => fileBlob(631117) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  it("requests the upload URL for the size of the bytes it sends", async () => {
    await uploadPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/jpg");

    expect(mockCreateUploadUrls).toHaveBeenCalledWith(
      expect.objectContaining({ body: { files: [{ contentType: "image/jpeg", sizeBytes: 631117 }] } }),
    );
  });

  it("sends a body typed with the signed content type", async () => {
    // React Native sends a Blob's own type as Content-Type, overriding the header.
    await uploadPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/jpg");

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("https://bucket.example.com/upload");
    expect(init.method).toBe("PUT");
    expect(init.body).toEqual({ size: 631117, type: "image/jpeg" });
    expect(init.headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("does not ask for an upload URL when the file is empty", async () => {
    mockFetch.mockReset().mockResolvedValueOnce({ blob: async () => fileBlob(0) });

    await expect(uploadPhoto("event-1", "file://photo.jpg", "photo.jpg", "image/jpeg")).rejects.toThrow(
      "Could not determine file size for upload",
    );
    expect(mockCreateUploadUrls).not.toHaveBeenCalled();
  });
});
