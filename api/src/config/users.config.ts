import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_ACCOUNT_DELETION_MAX_ATTEMPTS,
  DEFAULT_ACCOUNT_DELETION_RECONCILER_BATCH_SIZE,
  DEFAULT_ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS,
} from "src/users/users.constants";

export default registerAs("users", () => ({
  // Finishes dual-store account deletions left mid-saga (Auth0 cleared, Postgres
  // row still present).
  //
  // Opt-in on purpose. It decides which identities to delete from the Auth0
  // tenant in AUTH0_DOMAIN using rows in DATABASE_URL, and those two are not
  // paired outside a deployed environment: docker-compose and local dev point
  // at their own database while still loading the shared tenant's management
  // credentials from .env. Defaulting to on would let any such process delete
  // real logins, which cannot be undone. Same rule as the photo orphan
  // reconciler. Gating on NODE_ENV would not help: compose sets it to production.
  accountDeletionReconcilerEnabled: process.env.ACCOUNT_DELETION_RECONCILER_ENABLED === "true",
  accountDeletionReconcilerBatchSize: parseIntegerEnv(
    process.env.ACCOUNT_DELETION_RECONCILER_BATCH_SIZE,
    DEFAULT_ACCOUNT_DELETION_RECONCILER_BATCH_SIZE,
    1,
  ),
  accountDeletionReconcilerStuckAfterHours: parseIntegerEnv(
    process.env.ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS,
    DEFAULT_ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS,
    1,
  ),
  // After this many failed passes a saga stops being retried and is reported
  // once for manual recovery.
  accountDeletionMaxAttempts: parseIntegerEnv(
    process.env.ACCOUNT_DELETION_MAX_ATTEMPTS,
    DEFAULT_ACCOUNT_DELETION_MAX_ATTEMPTS,
    1,
  ),
}));
