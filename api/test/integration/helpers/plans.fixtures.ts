import { Plan } from "generated/prisma/client";

export const TEST_FREE_PLAN_ID = "f0000000-0000-4000-8000-000000000001";

/** The free plan's first version, as the migration seeds it. */
export const buildFreePlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: TEST_FREE_PLAN_ID,
  code: "FREE",
  version: 1,
  memberLimit: 30,
  storageLimitBytes: 3n * 1024n ** 3n,
  galleryWindowDays: 30,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
});
