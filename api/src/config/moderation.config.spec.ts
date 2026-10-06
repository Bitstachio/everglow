import moderationConfig from "./moderation.config";
import {
  DEFAULT_EVIDENCE_JOB_BATCH_SIZE,
  DEFAULT_REPORT_RETENTION_DAYS,
} from "src/moderation/evidence/evidence.constants";

describe("moderationConfig", () => {
  const MANAGED_VARS = ["MODERATION_EVIDENCE_JOB_ENABLED", "REPORT_RETENTION_DAYS", "EVIDENCE_JOB_BATCH_SIZE"] as const;
  const original = new Map(MANAGED_VARS.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    for (const name of MANAGED_VARS) delete process.env[name];
  });

  afterAll(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("evidenceJobEnabled", () => {
    // It deletes evidence objects from the shared bucket for rows in this
    // database: off unless the environment says exactly "true".
    it("is off by default", () => {
      expect(moderationConfig().evidenceJobEnabled).toBe(false);
    });

    it.each(["1", "yes", "TRUE", ""])("is off for %p", (value) => {
      process.env.MODERATION_EVIDENCE_JOB_ENABLED = value;
      expect(moderationConfig().evidenceJobEnabled).toBe(false);
    });

    it("is on for exactly true", () => {
      process.env.MODERATION_EVIDENCE_JOB_ENABLED = "true";
      expect(moderationConfig().evidenceJobEnabled).toBe(true);
    });
  });

  it("keeps reports for a year and works in batches of 200 by default", () => {
    expect(moderationConfig()).toMatchObject({
      reportRetentionDays: DEFAULT_REPORT_RETENTION_DAYS,
      evidenceJobBatchSize: DEFAULT_EVIDENCE_JOB_BATCH_SIZE,
    });
    expect(DEFAULT_REPORT_RETENTION_DAYS).toBe(365);
  });

  it("reads the retention window from REPORT_RETENTION_DAYS", () => {
    process.env.REPORT_RETENTION_DAYS = "400";
    expect(moderationConfig().reportRetentionDays).toBe(400);
  });
});
