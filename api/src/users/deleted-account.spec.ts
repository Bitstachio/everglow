import { hashProviderSub, isIssuedAfterDeletion } from "./deleted-account";

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
});
