import { registerAs } from "@nestjs/config";
import { parseIntegerEnv } from "src/common/utils/env.utils";
import {
  DEFAULT_EVIDENCE_JOB_BATCH_SIZE,
  DEFAULT_REPORT_RETENTION_DAYS,
} from "src/moderation/evidence/evidence.constants";
import {
  DEFAULT_SCREENING_BATCH_SIZE,
  DEFAULT_SCREENING_MAX_HOLD_MINUTES,
  DEFAULT_SCREENING_MIN_CONFIDENCE,
  DEFAULT_SCREENING_TIMEOUT_MS,
} from "src/moderation/screening/screening.constants";

export default registerAs("moderation", () => ({
  // Opt-in on purpose, like the gallery close job (photos.config). The
  // evidence job deletes evidence objects from AWS_S3_BUCKET for reports in
  // DATABASE_URL, and the two are only paired in a deployed environment.
  // Enable it only where this database owns the bucket.
  evidenceJobEnabled: process.env.MODERATION_EVIDENCE_JOB_ENABLED === "true",
  reportRetentionDays: parseIntegerEnv(process.env.REPORT_RETENTION_DAYS, DEFAULT_REPORT_RETENTION_DAYS, 1),
  evidenceJobBatchSize: parseIntegerEnv(process.env.EVIDENCE_JOB_BATCH_SIZE, DEFAULT_EVIDENCE_JOB_BATCH_SIZE, 1),
  // Upload screening (docs/moderation.md §11). Off unless exactly "true": it
  // sends every new photo to Amazon Rekognition, which needs the AWS AI
  // services opt-out policy, the privacy policy's wording and the
  // rekognition:DetectModerationLabels permission first (infra/README.md).
  screeningEnabled: process.env.MODERATION_SCREENING_ENABLED === "true",
  screeningMinConfidence: Math.min(
    100,
    parseIntegerEnv(process.env.SCREENING_MIN_CONFIDENCE, DEFAULT_SCREENING_MIN_CONFIDENCE, 1),
  ),
  screeningTimeoutMs: parseIntegerEnv(process.env.SCREENING_TIMEOUT_MS, DEFAULT_SCREENING_TIMEOUT_MS, 100),
  screeningMaxHoldMinutes: parseIntegerEnv(
    process.env.SCREENING_MAX_HOLD_MINUTES,
    DEFAULT_SCREENING_MAX_HOLD_MINUTES,
    1,
  ),
  screeningBatchSize: parseIntegerEnv(process.env.SCREENING_BATCH_SIZE, DEFAULT_SCREENING_BATCH_SIZE, 1),
}));
