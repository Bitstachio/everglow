import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_ACCOUNT_DELETION_RECONCILER_BATCH_SIZE,
  DEFAULT_ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS,
} from "src/users/users.constants";

export default registerAs("users", () => ({
  // Finishes dual-store account deletions left mid-saga (Auth0 cleared, Postgres
  // row still present). Safe to leave on: it only touches rows already marked
  // with deletionStartedAt in this database.
  accountDeletionReconcilerEnabled: process.env.ACCOUNT_DELETION_RECONCILER_ENABLED !== "false",
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
}));
