import photosConfig from "./photos.config";
import {
  DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
} from "src/photos/photos.constants";

describe("photosConfig", () => {
  const MANAGED_VARS = ["PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS", "PHOTO_PENDING_CLEANUP_BATCH_SIZE"] as const;

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

  // Both bounds share parseIntegerEnv with the orphan reconciler keys
  // (storage.config), so the floor of 1 is the only thing separating them. A
  // fractional value used to be accepted here.
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
