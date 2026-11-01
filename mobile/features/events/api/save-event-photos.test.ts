import { buildPhoto } from "../testing/fixtures";
import { createApiError } from "@/lib/api/errors";
import {
  LINK_FRESH_MS,
  isGonePhotoError,
  prepareSharedPhotos,
  requestLibraryAddAccess,
  saveEventPhoto,
} from "./save-event-photos";

const mockFindPhoto = jest.fn();
const mockDownloadFile = jest.fn();
const mockDeleteDownload = jest.fn();
const mockCreateAsset = jest.fn();
const mockRequestPermissions = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  photosControllerFindOne: (...args: unknown[]) => mockFindPhoto(...args),
}));
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  Asset: { create: (...args: unknown[]) => mockCreateAsset(...args) },
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file://cache" },
  File: Object.assign(
    jest.fn().mockImplementation((directory: string, filename: string) => ({ uri: `${directory}/${filename}` })),
    { downloadFileAsync: (...args: unknown[]) => mockDownloadFile(...args) },
  ),
}));

const listed = buildPhoto({ url: "https://bucket/original?listed" });
const renewed = buildPhoto({ url: "https://bucket/original?renewed" });

const downloadedUrls = () => mockDownloadFile.mock.calls.map(([url]) => url);
const destinations = () => mockDownloadFile.mock.calls.map(([, destination]) => destination.uri as string);

beforeEach(() => {
  mockFindPhoto.mockReset().mockResolvedValue({ data: { data: renewed } });
  mockDeleteDownload.mockReset();
  mockDownloadFile.mockReset().mockImplementation(async (_url: string, destination: { uri: string }) => ({
    uri: destination.uri,
    delete: mockDeleteDownload,
  }));
  mockCreateAsset.mockReset().mockResolvedValue({});
  mockRequestPermissions.mockReset().mockResolvedValue({ status: "granted" });
});

test("asks for add-only access to Photos", async () => {
  await expect(requestLibraryAddAccess()).resolves.toBe(true);
  expect(mockRequestPermissions).toHaveBeenCalledWith(true, ["photo"]);

  mockRequestPermissions.mockResolvedValue({ status: "denied" });
  await expect(requestLibraryAddAccess()).resolves.toBe(false);
});

test("downloads a fresh link as listed, without asking the API again", async () => {
  await saveEventPhoto(listed, Date.now() - 60_000);

  expect(downloadedUrls()).toEqual([listed.url]);
  expect(mockFindPhoto).not.toHaveBeenCalled();
  expect(mockCreateAsset).toHaveBeenCalledWith(destinations()[0]);
  expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
});

test("renews a link from a list fetched too long ago before downloading", async () => {
  await saveEventPhoto(listed, Date.now() - LINK_FRESH_MS);

  expect(mockFindPhoto).toHaveBeenCalledWith({ path: { photoId: "photo-1" }, throwOnError: true });
  expect(downloadedUrls()).toEqual([renewed.url]);
  expect(mockCreateAsset).toHaveBeenCalledTimes(1);
});

test("tries once more with a new link when a listed link is refused", async () => {
  mockDownloadFile.mockRejectedValueOnce(new Error("UnableToDownload: response has status 403"));

  await saveEventPhoto(listed, Date.now());

  expect(downloadedUrls()).toEqual([listed.url, renewed.url]);
  expect(mockCreateAsset).toHaveBeenCalledTimes(1);
});

test("gives up when the renewed link fails too", async () => {
  mockDownloadFile.mockRejectedValue(new Error("UnableToDownload: response has status 403"));

  await expect(saveEventPhoto(listed, 0)).rejects.toThrow("403");
  expect(downloadedUrls()).toEqual([renewed.url]);
  expect(mockCreateAsset).not.toHaveBeenCalled();
});

test("doesn't download again when the library refuses the file, and still removes it", async () => {
  mockCreateAsset.mockRejectedValueOnce(new Error("library write failed"));

  await expect(saveEventPhoto(listed, Date.now())).rejects.toThrow("library write failed");
  expect(mockDownloadFile).toHaveBeenCalledTimes(1);
  expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
});

test("gives every download of the same frame its own temporary file", async () => {
  await Promise.all([saveEventPhoto(listed, Date.now()), saveEventPhoto(listed, Date.now())]);

  const [first, second] = destinations();
  expect(first).toMatch(/^file:\/\/cache\/everglow-photo-1-\d+\.jpg$/);
  expect(second).toMatch(/^file:\/\/cache\/everglow-photo-1-\d+\.jpg$/);
  expect(first).not.toBe(second);
});

test("a frame that's gone doesn't get a second try", async () => {
  mockDownloadFile.mockRejectedValue(new Error("UnableToDownload: response has status 403"));
  mockFindPhoto.mockRejectedValue(createApiError("Photo not found", { status: 404 }));

  const error = await saveEventPhoto(listed, 0).catch((caught: unknown) => caught);
  expect(isGonePhotoError(error)).toBe(true);
  expect(mockFindPhoto).toHaveBeenCalledTimes(1);
  expect(mockDownloadFile).not.toHaveBeenCalled();
});

test("a save stopped while downloading never reaches the library, and its file goes", async () => {
  const controller = new AbortController();
  mockDownloadFile.mockImplementationOnce(async (_url: string, destination: { uri: string }) => {
    controller.abort();
    return { uri: destination.uri, delete: mockDeleteDownload };
  });

  await expect(saveEventPhoto(listed, Date.now(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(mockCreateAsset).not.toHaveBeenCalled();
  expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
});

test("downloads for sharing stay until the next share starts", async () => {
  const photos = [
    { photo: buildPhoto(), signedAt: Date.now() },
    { photo: buildPhoto({ id: "photo-2" }), signedAt: Date.now() },
  ];
  const first = await prepareSharedPhotos(photos);
  expect(first.map((file) => file.uri)).toEqual([
    expect.stringMatching(/^file:\/\/cache\/everglow-share-photo-1-\d+\.jpg$/),
    expect.stringMatching(/^file:\/\/cache\/everglow-share-photo-2-\d+\.jpg$/),
  ]);
  expect(mockDeleteDownload).not.toHaveBeenCalled();

  await prepareSharedPhotos(photos.slice(0, 1));
  expect(mockDeleteDownload).toHaveBeenCalledTimes(2);
});

test("a share that fails partway removes what it downloaded", async () => {
  mockDownloadFile
    .mockImplementationOnce(async (_url: string, destination: { uri: string }) => ({
      uri: destination.uri,
      delete: mockDeleteDownload,
    }))
    .mockRejectedValue(new Error("offline"));
  mockFindPhoto.mockRejectedValue(new Error("offline"));
  const photos = [
    { photo: buildPhoto(), signedAt: Date.now() },
    { photo: buildPhoto({ id: "photo-2" }), signedAt: Date.now() },
  ];
  // Clear anything an earlier test left for the next share.
  await prepareSharedPhotos([]);
  mockDeleteDownload.mockClear();

  await expect(prepareSharedPhotos(photos)).rejects.toThrow("offline");
  expect(mockDeleteDownload).toHaveBeenCalledTimes(1);
});
