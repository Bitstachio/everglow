import { registerAs } from "@nestjs/config";
import {
  DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
  DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
  DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
  FREE_TIER_STORAGE_LIMIT_BYTES,
} from "src/photos/photos.constants";

const parsePositiveBigInt = (value: string | undefined, fallback: bigint): bigint => {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Stricter than parsePositiveInt: rejects fractions and allows an explicit
// floor, because the reconciler accepts 0 for its age buffer but not for its
// batch size. Worth collapsing the two once the pending keys can change too.
const parseInteger = (value: string | undefined, fallback: number, min: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
};

export default registerAs("photos", () => ({
  storageLimitBytes: parsePositiveBigInt(process.env.PHOTO_STORAGE_LIMIT_BYTES, FREE_TIER_STORAGE_LIMIT_BYTES),

  pendingCleanupEnabled: process.env.PHOTO_PENDING_CLEANUP_ENABLED !== "false",
  pendingCleanupMaxAgeHours: parsePositiveInt(
    process.env.PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS,
    DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
  ),
  pendingCleanupBatchSize: parsePositiveInt(
    process.env.PHOTO_PENDING_CLEANUP_BATCH_SIZE,
    DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  ),

  // Opt-in on purpose. The sweep deletes from AWS_S3_BUCKET based on rows in
  // DATABASE_URL, and those two are not paired outside the deployed environment:
  // docker-compose and local dev point at their own database while still holding
  // the shared bucket credentials from .env. Defaulting to on would let any such
  // process delete another environment's live photos, and the bucket has no
  // versioning to recover them. Enable it only where Postgres owns the bucket.
  orphanReconcilerEnabled: process.env.PHOTO_ORPHAN_RECONCILER_ENABLED === "true",
  orphanReconcilerBatchSize: parseInteger(
    process.env.PHOTO_ORPHAN_RECONCILER_BATCH_SIZE,
    DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
    1,
  ),
  // 0 disables the age buffer; anything listed is a candidate.
  orphanReconcilerMinObjectAgeHours: parseInteger(
    process.env.PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
    DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
    0,
  ),
}));
