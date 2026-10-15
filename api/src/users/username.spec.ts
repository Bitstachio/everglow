import { normalizeUsername, usernameCandidates, usernameFormatReason } from "./username";

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

  describe("usernameCandidates", () => {
    it("builds name-based candidates first, then numbered ones", () => {
      expect(usernameCandidates("maya", "Maya Chen", 2026).slice(0, 6)).toEqual([
        "maya.chen",
        "mayachen",
        "maya_c",
        "maya.c26",
        "maya.26",
        "maya_26",
      ]);
    });

    it("uses the last word of the name and folds accents and apostrophes", () => {
      expect(usernameCandidates("zoe", "Zoë Anne O’Neil", 2026)[0]).toBe("zoe.oneil");
    });

    it("skips name candidates for a one-word name", () => {
      expect(usernameCandidates("maya", "Maya", 2026)[0]).toBe("maya.26");
    });

    it("cuts a long username so each candidate fits", () => {
      const long = "a".repeat(30);
      const candidates = usernameCandidates(long, "", 2026);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((candidate) => candidate.length <= 30 && candidate !== long)).toBe(true);
    });

    it("never returns invalid, reserved or repeated candidates", () => {
      const candidates = usernameCandidates("ab", "", 2026);
      expect(candidates.every((candidate) => usernameFormatReason(candidate) === null)).toBe(true);
      expect(new Set(candidates).size).toBe(candidates.length);
    });
  });
});
