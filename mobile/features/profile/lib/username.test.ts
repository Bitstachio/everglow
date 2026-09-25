import { isUsernameFormatValid, normalizeUsername, usernameAvailabilityMessage, usernameSchema } from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Jane.Doe  ")).toBe("jane.doe");
  });
});

describe("isUsernameFormatValid", () => {
  it("accepts a valid username", () => {
    expect(isUsernameFormatValid("jane.doe")).toBe(true);
  });

  it("rejects short or unsupported values", () => {
    expect(isUsernameFormatValid("ab")).toBe(false);
    expect(isUsernameFormatValid("jane-doe")).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("parses a valid username", () => {
    expect(usernameSchema.parse("  ada.lovelace  ")).toBe("ada.lovelace");
  });

  it("rejects unsupported characters", () => {
    expect(() => usernameSchema.parse("Ada Lovelace")).toThrow();
  });
});

describe("usernameAvailabilityMessage", () => {
  it("maps reasons to copy", () => {
    expect(usernameAvailabilityMessage("TAKEN")).toBe("This username is taken");
    expect(usernameAvailabilityMessage("RESERVED")).toBe("This username is reserved");
    expect(usernameAvailabilityMessage(null)).toBeNull();
  });
});
