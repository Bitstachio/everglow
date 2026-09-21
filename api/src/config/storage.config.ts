import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
  DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
} from "src/storage/storage.constants";

// The variables keep their PHOTO_ prefix from when photos/ was the only prefix
// the reconciler walked: renaming an opt-in flag would silently switch the job
// off in every environment that has it on.
export default registerAs("storage", () => ({
  // Opt-in on purpose. The sweep deletes from AWS_S3_BUCKET based on rows in
  // DATABASE_URL, and those two are not paired outside the deployed environment:
  // docker-compose and local dev point at their own database while still holding
  // the shared bucket credentials from .env. Defaulting to on would let any such
  // process delete another environment's live objects, and the bucket has no
  // versioning to recover them. Enable it only where Postgres owns the bucket.
  orphanReconcilerEnabled: process.env.PHOTO_ORPHAN_RECONCILER_ENABLED === "true",
  orphanReconcilerBatchSize: parseIntegerEnv(
    process.env.PHOTO_ORPHAN_RECONCILER_BATCH_SIZE,
    DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
    1,
  ),
  // 0 disables the age buffer; anything listed is a candidate, except under a
  // prefix whose source sets its own floor (OrphanSource.minObjectAgeMs).
  orphanReconcilerMinObjectAgeHours: parseIntegerEnv(
    process.env.PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
    DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
    0,
  ),
}));
