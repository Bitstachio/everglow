import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_GALLERY_CLOSE_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
} from "src/photos/photos.constants";

export default registerAs("photos", () => ({
  pendingCleanupEnabled: process.env.PHOTO_PENDING_CLEANUP_ENABLED !== "false",
  pendingCleanupMaxAgeHours: parseIntegerEnv(
    process.env.PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS,
    DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
    1,
  ),
  pendingCleanupBatchSize: parseIntegerEnv(
    process.env.PHOTO_PENDING_CLEANUP_BATCH_SIZE,
    DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
    1,
  ),
  // Opt-in on purpose, like the orphan reconciler (storage.config). The close
  // job deletes objects from AWS_S3_BUCKET for photo rows in DATABASE_URL, and
  // the two are only paired in a deployed environment: a database copied from
  // another environment would delete that environment's photos, and the bucket
  // has no versioning. Enable it only where this database owns the bucket.
  galleryCloseEnabled: process.env.GALLERY_CLOSE_ENABLED === "true",
  galleryCloseBatchSize: parseIntegerEnv(process.env.GALLERY_CLOSE_BATCH_SIZE, DEFAULT_GALLERY_CLOSE_BATCH_SIZE, 1),
}));
