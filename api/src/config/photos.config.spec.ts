import photosConfig from "./photos.config";
import {
  DEFAULT_ORPHAN_RECONCILER_BATCH_SIZE,
  DEFAULT_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS,
} from "src/photos/photos.constants";

describe("photosConfig", () => {
  const ORPHAN_VARS = [
    "PHOTO_ORPHAN_RECONCILER_ENABLED",
    "PHOTO_ORPHAN_RECONCILER_BATCH_SIZE",
    "PHOTO_ORPHAN_RECONCILER_MIN_OBJECT_AGE_HOURS",
  ] as const;

  const original = new Map(ORPHAN_VARS.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    for (const name of ORPHAN_VARS) delete process.env[name];
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
});
