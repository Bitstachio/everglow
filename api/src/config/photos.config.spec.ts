import photosConfig from "./photos.config";
import {
  DEFAULT_GALLERY_CLOSE_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_CLEANUP_BATCH_SIZE,
  DEFAULT_PENDING_PHOTO_MAX_AGE_HOURS,
} from "src/photos/photos.constants";

describe("photosConfig", () => {
  const MANAGED_VARS = [
    "PHOTO_PENDING_CLEANUP_MAX_AGE_HOURS",
    "PHOTO_PENDING_CLEANUP_BATCH_SIZE",
    "GALLERY_CLOSE_ENABLED",
    "GALLERY_CLOSE_BATCH_SIZE",
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

  // Destructive and keyed off rows in DATABASE_URL, so it must stay off unless
  // switched on explicitly (docs/photos-architecture.md §12).
  describe("gallery close", () => {
    it("is off unless GALLERY_CLOSE_ENABLED is exactly true", () => {
      expect(photosConfig().galleryCloseEnabled).toBe(false);

      for (const value of ["TRUE", "1", "yes", "false"]) {
        process.env.GALLERY_CLOSE_ENABLED = value;
        expect(photosConfig().galleryCloseEnabled).toBe(false);
      }

      process.env.GALLERY_CLOSE_ENABLED = "true";
      expect(photosConfig().galleryCloseEnabled).toBe(true);
    });

    it("takes a positive whole batch size, or the default", () => {
      expect(photosConfig().galleryCloseBatchSize).toBe(DEFAULT_GALLERY_CLOSE_BATCH_SIZE);

      process.env.GALLERY_CLOSE_BATCH_SIZE = "250";
      expect(photosConfig().galleryCloseBatchSize).toBe(250);

      process.env.GALLERY_CLOSE_BATCH_SIZE = "0";
      expect(photosConfig().galleryCloseBatchSize).toBe(DEFAULT_GALLERY_CLOSE_BATCH_SIZE);
    });
  });
});
