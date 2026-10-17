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
      expect(usernameCandidates("maya", "Maya Chen", { year: 2026 }).slice(0, 6)).toEqual([
        "maya.chen",
        "mayachen",
        "maya_c",
        "maya.c26",
        "maya.26",
        "maya_26",
      ]);
    });

    it("uses the last word of the name and folds accents and apostrophes", () => {
      expect(usernameCandidates("zoe", "Zoë Anne O’Neil", { year: 2026 })[0]).toBe("zoe.oneil");
    });

    it("skips name candidates for a one-word name", () => {
      expect(usernameCandidates("maya", "Maya", { year: 2026 })[0]).toBe("maya.26");
    });

    it("cuts a long username so each candidate fits", () => {
      const long = "a".repeat(30);
      const candidates = usernameCandidates(long, "", { year: 2026 });
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((candidate) => candidate.length <= 30 && candidate !== long)).toBe(true);
    });

    it("ends with random two- and three-digit endings after maya2 to maya9", () => {
      // 0.5 lands on 55 and 550 in those ranges.
      const candidates = usernameCandidates("maya", "", { year: 2026, random: () => 0.5 });
      expect(candidates.slice(2, 10)).toEqual(["maya2", "maya3", "maya4", "maya5", "maya6", "maya7", "maya8", "maya9"]);
      expect(candidates.slice(10)).toEqual(["maya55", "maya_55", "maya550", "maya.550"]);
    });

    it("keeps random endings inside their ranges", () => {
      const low = usernameCandidates("maya", "", { year: 2026, random: () => 0 }).slice(10);
      const high = usernameCandidates("maya", "", { year: 2026, random: () => 0.999999 }).slice(10);
      expect(low).toEqual(["maya10", "maya_10", "maya100", "maya.100"]);
      expect(high).toEqual(["maya99", "maya_99", "maya999", "maya.999"]);
    });

    it("drops a random ending that repeats an earlier candidate", () => {
      // 0.18 gives 26 for the two-digit endings, the same as the year.
      const candidates = usernameCandidates("maya", "", { year: 2026, random: () => 0.18 });
      expect(candidates.filter((candidate) => candidate === "maya_26")).toHaveLength(1);
    });

    it("never returns invalid, reserved or repeated candidates", () => {
      const candidates = usernameCandidates("ab", "", { year: 2026 });
      expect(candidates.every((candidate) => usernameFormatReason(candidate) === null)).toBe(true);
      expect(new Set(candidates).size).toBe(candidates.length);
    });
  });
});
