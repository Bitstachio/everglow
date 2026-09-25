import { deriveUsernameBaseFromEmail, normalizeUsername, usernameFormatReason, usernameWithSuffix } from "./username";

describe("username helpers", () => {
  describe("normalizeUsername", () => {
    it("trims and lowercases", () => {
      expect(normalizeUsername("  Jane.Doe  ")).toBe("jane.doe");
    });
  });

  describe("usernameFormatReason", () => {
    it("returns null for a valid username", () => {
      expect(usernameFormatReason("jane.doe")).toBeNull();
    });

    it("returns INVALID_FORMAT when too short", () => {
      expect(usernameFormatReason("ab")).toBe("INVALID_FORMAT");
    });

    it("returns INVALID_FORMAT for unsupported characters", () => {
      expect(usernameFormatReason("jane-doe")).toBe("INVALID_FORMAT");
    });

    it("returns RESERVED for reserved names", () => {
      expect(usernameFormatReason("support")).toBe("RESERVED");
    });
  });

  describe("deriveUsernameBaseFromEmail", () => {
    it("uses the lowercased local part", () => {
      expect(deriveUsernameBaseFromEmail("Jane.Doe@example.com")).toBe("jane.doe");
    });

    it("pads short local parts to three characters", () => {
      expect(deriveUsernameBaseFromEmail("ab@example.com")).toBe("abx");
    });

    it("suffixes reserved names", () => {
      expect(deriveUsernameBaseFromEmail("admin@example.com")).toBe("admin1");
    });
  });

  describe("usernameWithSuffix", () => {
    it("returns the base for suffix 1", () => {
      expect(usernameWithSuffix("jane", 1)).toBe("jane");
    });

    it("appends the suffix and respects the max length", () => {
      expect(usernameWithSuffix("a".repeat(30), 2)).toHaveLength(30);
      expect(usernameWithSuffix("jane", 2)).toBe("jane2");
    });
  });
});
