import { isDatabaseIdentity, socialProvider } from "./auth0-identity";

describe("isDatabaseIdentity", () => {
  it.each([
    ["auth0|abc", true],
    ["auth0|", true],
    ["apple|001.abc", false],
    ["google-oauth2|123", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%p → %p", (sub, expected) => {
    expect(isDatabaseIdentity(sub)).toBe(expected);
  });
});

describe("socialProvider", () => {
  it.each([
    ["apple|001.abc", "apple"],
    ["google-oauth2|123", "google"],
    ["auth0|abc", null],
    ["windowslive|1", null],
    [null, null],
  ])("%p → %p", (sub, expected) => {
    expect(socialProvider(sub)).toBe(expected);
  });
});
