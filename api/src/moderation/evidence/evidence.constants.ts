/** Where quarantined copies of reported objects live (docs/moderation.md §7). */
export const EVIDENCE_S3_KEY_PREFIX = "evidence/";

/** How long a closed report and its evidence are kept, unless held. */
export const DEFAULT_REPORT_RETENTION_DAYS = 365;

/** Reports purged, and failed copies retried, per run of the daily evidence job. */
export const DEFAULT_EVIDENCE_JOB_BATCH_SIZE = 200;

/**
 * `evidence/{reportId}/{the original key}`: one copy per report, so purging a
 * report removes exactly its own objects, and the original key still says
 * where the copy came from.
 */
export const buildEvidenceS3Key = (reportId: string, sourceKey: string): string =>
  `${EVIDENCE_S3_KEY_PREFIX}${reportId}/${sourceKey}`;

const EVIDENCE_KEY_PATTERN = /^evidence\/[0-9a-f-]{36}\/.+$/;

export const isEvidenceS3Key = (key: string): boolean => EVIDENCE_KEY_PATTERN.test(key);
