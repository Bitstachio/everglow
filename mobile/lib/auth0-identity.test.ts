import { isDatabaseIdentity } from "./auth0-identity";

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
