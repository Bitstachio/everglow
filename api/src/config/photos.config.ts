import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
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
}));
