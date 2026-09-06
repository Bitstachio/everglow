import photosConfig from "./photos.config";
import {
  DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
  DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
  DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
} from "src/photos/photos.constants";

describe("photosConfig", () => {
  const MANAGED_VARS = [
    "PHOTO_ORPHAN_RECONCILER_ENABLED",
    "PHOTO_ORPHAN_RECONCILER_BATCH_SIZE",
    "PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS",
    "PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS",
    "PHOTO_PENDING_CLEANUP_BATCH_SIZE",
  ] as const;

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

  describe("orphanReconcilerEnabled", () => {
    // The sweep deletes from a bucket shared across environments using rows from a
    // database that is not. Anything other than an explicit opt-in risks a dev or
    // compose process deleting another environment's photos, unrecoverably.
    it("is off when the variable is unset", () => {
      expect(photosConfig().orphanReconcilerEnabled).toBe(false);
    });

    it('is on only for exactly "true"', () => {
      process.env.PHOTO_ORPHAN_RECONCILER_ENABLED = "true";

      expect(photosConfig().orphanReconcilerEnabled).toBe(true);
    });

    it.each(["false", "TRUE", "1", "yes", ""])("stays off for %p", (value) => {
      process.env.PHOTO_ORPHAN_RECONCILER_ENABLED = value;

      expect(photosConfig().orphanReconcilerEnabled).toBe(false);
    });
  });

  describe("orphan reconciler bounds", () => {
    it("falls back to the defaults when unset", () => {
      const config = photosConfig();

      expect(config.orphanReconcilerBatchSize).toBe(DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE);
      expect(config.orphanReconcilerMinObjectAgeHours).toBe(DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS);
    });

    it("accepts a zero minimum age but not a zero batch size", () => {
      process.env.PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS = "0";
      process.env.PHOTO_ORPHAN_RECONCILER_BATCH_SIZE = "0";

      const config = photosConfig();

      expect(config.orphanReconcilerMinObjectAgeHours).toBe(0);
      expect(config.orphanReconcilerBatchSize).toBe(DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE);
    });

    it.each(["-1", "abc", "1.5"])("ignores the invalid batch size %p", (value) => {
      process.env.PHOTO_ORPHAN_RECONCILER_BATCH_SIZE = value;

      expect(photosConfig().orphanReconcilerBatchSize).toBe(DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE);
    });
  });

  // Both bounds share parseIntegerEnv with the orphan keys, so the floor of 1 is
  // the only thing separating them. A fractional value used to be accepted here.
  describe("pending cleanup bounds", () => {
    it("falls back to the defaults when unset", () => {
      const config = photosConfig();

      expect(config.pendingCleanupMaxAgeHours).toBe(DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS);
      expect(config.pendingCleanupBatchSize).toBe(DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE);
    });

    it("reads a valid override", () => {
      process.env.PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS = "6";
      process.env.PHOTO_PENDING_CLEANUP_BATCH_SIZE = "50";

      const config = photosConfig();

      expect(config.pendingCleanupMaxAgeHours).toBe(6);
      expect(config.pendingCleanupBatchSize).toBe(50);
    });

    it.each(["0", "-1", "1.5", "abc", " "])("ignores the invalid bound %p", (value) => {
      process.env.PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS = value;
      process.env.PHOTO_PENDING_CLEANUP_BATCH_SIZE = value;

      const config = photosConfig();

      expect(config.pendingCleanupMaxAgeHours).toBe(DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS);
      expect(config.pendingCleanupBatchSize).toBe(DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE);
    });
  });
});
