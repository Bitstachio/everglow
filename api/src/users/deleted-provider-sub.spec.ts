import {
  hashProviderSub,
  isIssuedAfterDeletion,
  TOMBSTONE_RETENTION_DAYS,
  tombstoneExpiresAt,
} from "./deleted-provider-sub";

describe("deleted account tombstone helpers", () => {
  describe("hashProviderSub", () => {
    it("is a stable 64-character hex digest that does not contain the subject", () => {
      const hash = hashProviderSub("auth0|abc123");

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(hashProviderSub("auth0|abc123"));
      expect(hash).not.toContain("abc123");
    });

    it("differs for different subjects", () => {
      expect(hashProviderSub("auth0|abc123")).not.toBe(hashProviderSub("auth0|abc124"));
    });
  });

  describe("isIssuedAfterDeletion", () => {
    const deletedAt = new Date("2026-06-10T12:00:00.000Z");
    const deletedAtSeconds = deletedAt.getTime() / 1000;

    it("accepts a token minted after the deletion", () => {
      expect(isIssuedAfterDeletion(deletedAtSeconds + 1, deletedAt)).toBe(true);
    });

    it("refuses a token minted before, or in the same second as, the deletion", () => {
      expect(isIssuedAfterDeletion(deletedAtSeconds - 1, deletedAt)).toBe(false);
      expect(isIssuedAfterDeletion(deletedAtSeconds, deletedAt)).toBe(false);
    });

    it("refuses a token that cannot be placed in time", () => {
      expect(isIssuedAfterDeletion(undefined, deletedAt)).toBe(false);
    });
  });

  describe("tombstoneExpiresAt", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const deletedAt = new Date("2026-06-10T12:00:00.000Z");
    const days = (from: Date, n: number) => new Date(from.getTime() + n * DAY_MS);
    const input = (overrides: Partial<Parameters<typeof tombstoneExpiresAt>[0]> = {}) => ({
      deletedAt,
      sanctioned: true,
      relatedReports: [],
      reportRetentionDays: 365,
      ...overrides,
    });

    it("lets a tombstone that carries nothing go after the base window, whatever the reports", () => {
      expect(TOMBSTONE_RETENTION_DAYS).toBe(30);
      expect(
        tombstoneExpiresAt(input({ sanctioned: false, relatedReports: [{ resolvedAt: null, holdUntil: null }] })),
      ).toEqual(days(deletedAt, 30));
    });

    it("keeps a sanctioned tombstone with no reports for a retention period after the deletion", () => {
      expect(tombstoneExpiresAt(input())).toEqual(days(deletedAt, 365));
    });

    it("keeps a sanctioned tombstone with no end while a report about the account is open", () => {
      expect(
        tombstoneExpiresAt(
          input({
            relatedReports: [
              { resolvedAt: days(deletedAt, -10), holdUntil: null },
              { resolvedAt: null, holdUntil: null },
            ],
          }),
        ),
      ).toBeNull();
    });

    it("keeps it until a retention period after the last report closes, when that is later", () => {
      const closed = days(deletedAt, 40);
      expect(
        tombstoneExpiresAt(
          input({
            relatedReports: [
              { resolvedAt: days(deletedAt, 5), holdUntil: null },
              { resolvedAt: closed, holdUntil: null },
            ],
          }),
        ),
      ).toEqual(days(closed, 365));
    });

    it("keeps it as long as a hold keeps a report", () => {
      const holdUntil = days(deletedAt, 900);
      expect(tombstoneExpiresAt(input({ relatedReports: [{ resolvedAt: days(deletedAt, 1), holdUntil }] }))).toEqual(
        holdUntil,
      );
    });

    it("never lets reports closed before the deletion shorten the floor", () => {
      // Suspending an account closes its member reports, often long before it is deleted.
      expect(
        tombstoneExpiresAt(input({ relatedReports: [{ resolvedAt: days(deletedAt, -300), holdUntil: null }] })),
      ).toEqual(days(deletedAt, 365));
    });

    it("follows REPORT_RETENTION_DAYS, and never drops below the base window", () => {
      expect(tombstoneExpiresAt(input({ reportRetentionDays: 90 }))).toEqual(days(deletedAt, 90));
      expect(tombstoneExpiresAt(input({ reportRetentionDays: 7 }))).toEqual(days(deletedAt, 30));
    });
  });
});
