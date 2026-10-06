import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_EVIDENCE_JOB_BATCH_SIZE,
  DEFAULT_REPORT_RETENTION_DAYS,
} from "src/moderation/evidence/evidence.constants";

export default registerAs("moderation", () => ({
  // Opt-in on purpose, like the gallery close job (photos.config). The
  // evidence job deletes evidence objects from AWS_S3_BUCKET for reports in
  // DATABASE_URL, and the two are only paired in a deployed environment.
  // Enable it only where this database owns the bucket.
  evidenceJobEnabled: process.env.MODERATION_EVIDENCE_JOB_ENABLED === "true",
  reportRetentionDays: parseIntegerEnv(process.env.REPORT_RETENTION_DAYS, DEFAULT_REPORT_RETENTION_DAYS, 1),
  evidenceJobBatchSize: parseIntegerEnv(process.env.EVIDENCE_JOB_BATCH_SIZE, DEFAULT_EVIDENCE_JOB_BATCH_SIZE, 1),
}));
