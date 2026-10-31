// The Lambda that writes the renditions. Imported, not copied, so a change to
// its key layout fails here until the API's builder follows it.
import {
  DERIVED_KEY_PREFIX,
  LARGE_OBJECT_NAME,
  THUMB_OBJECT_NAME,
  derivedKeysForOriginal,
} from "../../../functions/image-processor/src/keys";
import {
  buildPhotoDerivativeS3Keys,
  buildPhotoS3Key,
  buildPhotoThumbnailS3Key,
  hasPhotoDerivatives,
  PHOTO_DERIVED_S3_KEY_PREFIX,
  PHOTO_LARGE_OBJECT_NAME,
  PHOTO_THUMBNAIL_OBJECT_NAME,
  withPhotoDerivativeS3Keys,
} from "./photos.constants";

const userId = "11111111-1111-1111-1111-111111111111";
const eventId = "66666666-6666-6666-6666-666666666666";
const photoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const original = buildPhotoS3Key(userId, eventId, photoId);
// Pre-#38 layout, still referenced by old rows.
const legacyOriginal = `photos/${eventId}/${photoId}`;

describe("photo derivative keys", () => {
  it("uses the image processor's prefix and object names", () => {
    expect(PHOTO_DERIVED_S3_KEY_PREFIX).toBe(DERIVED_KEY_PREFIX);
    expect(PHOTO_THUMBNAIL_OBJECT_NAME).toBe(THUMB_OBJECT_NAME);
    expect(PHOTO_LARGE_OBJECT_NAME).toBe(LARGE_OBJECT_NAME);
  });

  it.each([original, legacyOriginal])("builds the keys the image processor writes for %s", (key) => {
    expect(buildPhotoDerivativeS3Keys(key)).toEqual(derivedKeysForOriginal(key));
    expect(buildPhotoThumbnailS3Key(key)).toBe(derivedKeysForOriginal(key).thumb);
  });

  it("pins the layout", () => {
    expect(buildPhotoDerivativeS3Keys(original)).toEqual({
      thumb: `derived/photos/${userId}/${eventId}/${photoId}/thumb.webp`,
      large: `derived/photos/${userId}/${eventId}/${photoId}/large.jpg`,
    });
  });

  it("renders exactly the keys the image processor accepts", () => {
    expect(hasPhotoDerivatives(original)).toBe(true);
    expect(hasPhotoDerivatives(legacyOriginal)).toBe(true);
    expect(hasPhotoDerivatives("event-covers/e/c")).toBe(false);
    expect(() => derivedKeysForOriginal("event-covers/e/c")).toThrow();
  });

  it("puts each photo original next to its derived keys and passes other keys through", () => {
    const { thumb, large } = buildPhotoDerivativeS3Keys(original);
    expect(withPhotoDerivativeS3Keys([original, "event-covers/e/c"])).toEqual([
      original,
      thumb,
      large,
      "event-covers/e/c",
    ]);
    expect(withPhotoDerivativeS3Keys([])).toEqual([]);
  });
});
