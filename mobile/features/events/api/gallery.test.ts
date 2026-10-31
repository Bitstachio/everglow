jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
import { createApiError } from "@/lib/api/errors";
import { buildPhoto } from "../testing/fixtures";
import { readAllGalleryPhotos, readGalleryPhoto, removeGalleryPhoto } from "./gallery";

const mockList = jest.fn();
const mockRead = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/lib/api/generated", () => ({
  photosControllerListPhotos: (...args: unknown[]) => mockList(...args),
  photosControllerFindOne: (...args: unknown[]) => mockRead(...args),
  photosControllerRemove: (...args: unknown[]) => mockRemove(...args),
}));
beforeEach(() => jest.clearAllMocks());

test("bulk enumeration deduplicates photos across page changes", async () => {
  const photo = buildPhoto();
  mockList
    .mockResolvedValueOnce({ data: { data: { items: [photo], nextCursor: "page-2" } } })
    .mockResolvedValueOnce({ data: { data: { items: [photo, buildPhoto({ id: "photo-2" })], nextCursor: null } } });
  expect((await readAllGalleryPhotos("event-1", new AbortController().signal)).map((item) => item.id)).toEqual([
    "photo-1",
    "photo-2",
  ]);
});

test("a repeated cursor fails instead of running forever or exporting a partial roll", async () => {
  mockList.mockResolvedValue({ data: { data: { items: [buildPhoto()], nextCursor: "repeat" } } });
  await expect(readAllGalleryPhotos("event-1", new AbortController().signal)).rejects.toThrow("Repeated photo cursor");
  expect(mockList).toHaveBeenCalledTimes(2);
});

test("original URL renewal is an authorized single-photo read with cancellation", async () => {
  const photo = buildPhoto();
  const signal = new AbortController().signal;
  mockRead.mockResolvedValue({ data: { data: photo } });
  expect(await readGalleryPhoto(photo.id, signal)).toEqual(photo);
  expect(mockRead).toHaveBeenCalledWith({ path: { photoId: photo.id }, signal, throwOnError: true });
});

test("already-removed photos succeed while a refused deletion remains a failure", async () => {
  mockRemove
    .mockRejectedValueOnce(createApiError("Gone", { status: 404 }))
    .mockRejectedValueOnce(createApiError("Refused", { status: 403 }));
  const signal = new AbortController().signal;
  await expect(removeGalleryPhoto("gone", signal)).resolves.toBeUndefined();
  await expect(removeGalleryPhoto("forbidden", signal)).rejects.toMatchObject({ status: 403 });
});
