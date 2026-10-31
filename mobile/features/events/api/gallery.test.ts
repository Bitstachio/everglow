import { buildPhoto } from "../testing/fixtures";
import { readAllGalleryPhotos } from "./gallery";

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));

const mockList = jest.fn();
jest.mock("@/lib/api/generated", () => ({
  photosControllerListPhotos: (...args: unknown[]) => mockList(...args),
}));
beforeEach(() => jest.clearAllMocks());

test("bulk enumeration deduplicates photos across page changes and notes when each was signed", async () => {
  const photo = buildPhoto();
  mockList
    .mockResolvedValueOnce({ data: { data: { items: [photo], nextCursor: "page-2" } } })
    .mockResolvedValueOnce({ data: { data: { items: [photo, buildPhoto({ id: "photo-2" })], nextCursor: null } } });
  const before = Date.now();
  const photos = await readAllGalleryPhotos("event-1", new AbortController().signal);
  expect(photos.map((item) => item.photo.id)).toEqual(["photo-1", "photo-2"]);
  expect(photos.every((item) => item.signedAt >= before && item.signedAt <= Date.now())).toBe(true);
});

test("a repeated cursor fails instead of running forever or exporting a partial roll", async () => {
  mockList.mockResolvedValue({ data: { data: { items: [buildPhoto()], nextCursor: "repeat" } } });
  await expect(readAllGalleryPhotos("event-1", new AbortController().signal)).rejects.toThrow("Repeated photo cursor");
  expect(mockList).toHaveBeenCalledTimes(2);
});
