import { mapWithConcurrency } from "src/common/utils/async.utils";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { PHOTO_HASH_CONCURRENCY, PHOTO_HASH_TIMEOUT_MS } from "./photos.constants";

/**
 * The SHA-256 of each photo original, read once from S3 (docs/moderation.md
 * §7), a few at a time. Null for a photo whose read failed or timed out:
 * hashing never blocks the caller, and the backfill job tries again later.
 */
export const hashPhotoOriginals = async (
  s3Service: S3Service,
  photos: readonly { id: string; s3Key: string }[],
): Promise<Map<string, string | null>> => {
  const hashes = await mapWithConcurrency(photos, PHOTO_HASH_CONCURRENCY, (photo) =>
    s3Service.sha256OfObject(photo.s3Key, { timeoutMs: PHOTO_HASH_TIMEOUT_MS }).catch(() => null),
  );
  return new Map(photos.map((photo, index) => [photo.id, hashes[index]]));
};
