import { normalizeUsername, usernameFormatReason } from "./username";

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
});
