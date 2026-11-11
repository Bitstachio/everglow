import { buildPhoto } from "../testing/fixtures";
import { photoPreview, THUMBNAIL_LATE_MS } from "./photo-preview";

const now = Date.parse("2026-11-11T12:00:00.000Z");
const addedAgo = (ms: number) => buildPhoto({ id: "p1", createdAt: new Date(now - ms).toISOString() });

test("previews a photo by its thumbnail, with the original under the viewer's cache key as the fallback", () => {
  const photo = addedAgo(THUMBNAIL_LATE_MS);
  expect(photoPreview(photo, now)).toEqual({
    uri: photo.thumbnailUrl,
    cacheKey: "photo:p1:thumbnail",
    fallback: { uri: photo.url, cacheKey: "photo:p1:original" },
    mayBeLate: false,
  });
});

test("a photo added moments ago may still be waiting for its thumbnail", () => {
  expect(photoPreview(addedAgo(5_000), now).mayBeLate).toBe(true);
  expect(photoPreview(addedAgo(THUMBNAIL_LATE_MS - 1), now).mayBeLate).toBe(true);
});

test("a photo with an unreadable date is treated as new", () => {
  expect(photoPreview(buildPhoto({ createdAt: "not a date" }), now).mayBeLate).toBe(true);
});

test("an empty thumbnail link leaves only the original", () => {
  const preview = photoPreview(buildPhoto({ id: "p2", thumbnailUrl: "" }), now);
  expect(preview.uri).toBeUndefined();
  expect(preview.fallback).toEqual({ uri: buildPhoto().url, cacheKey: "photo:p2:original" });
});
