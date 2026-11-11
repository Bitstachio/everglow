import type { PhotoPreview } from "@/components/ui/retrying-photo";
import type { PhotoResponseDto } from "../types";

/**
 * How long after a photo is added its thumbnail may still be on its way. The
 * image processor writes it within seconds of the upload; a redelivered job
 * comes back after six minutes. Past this, a thumbnail that fails to load was
 * never written (an older upload, or processing failed).
 */
export const THUMBNAIL_LATE_MS = 10 * 60_000;

/** Cache identity of a photo's thumbnail, independent of its URL signature. */
export const thumbnailCacheKey = (photoId: string) => `photo:${photoId}:thumbnail`;

/** Cache identity of a photo's original. The viewer loads it under the same key, so one download serves both. */
export const originalCacheKey = (photoId: string) => `photo:${photoId}:original`;

/**
 * How every small preview of a photo loads: its thumbnail, and the original
 * when the thumbnail is missing. A new photo's thumbnail is retried a few
 * times first, since it may not be written yet; an older one goes to the
 * original on its first failure. The original is full size, so this only
 * happens for photos that have no thumbnail.
 */
export const photoPreview = (
  photo: Pick<PhotoResponseDto, "id" | "url" | "thumbnailUrl" | "createdAt">,
  now: number = Date.now(),
): PhotoPreview & { cacheKey: string } => {
  const age = now - new Date(photo.createdAt).getTime();
  return {
    // Typed as always present, but an empty or missing link goes straight to the original.
    uri: photo.thumbnailUrl || undefined,
    cacheKey: thumbnailCacheKey(photo.id),
    fallback: { uri: photo.url, cacheKey: originalCacheKey(photo.id) },
    // An unreadable date counts as new: retrying costs less than an original.
    mayBeLate: !(age >= THUMBNAIL_LATE_MS),
  };
};
