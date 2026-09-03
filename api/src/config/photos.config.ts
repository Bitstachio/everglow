import { registerAs } from "@nestjs/config";
import {
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
}));
