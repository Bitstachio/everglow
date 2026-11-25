import { extractInvitationToken, firstName, looksLikeInvite, routeForIncomingLink } from "./invite";

describe("extractInvitationToken", () => {
  test.each([
    ["a bare token", "  k8Qm2  ", "k8Qm2"],
    ["a link on the API's domain", "https://events.everglow.app/invite/k8Qm2", "k8Qm2"],
    ["a link on another domain", "https://everglow.social/join/k8Qm2", "k8Qm2"],
    ["a link without a scheme", "everglow.social/join/k8Qm2", "k8Qm2"],
    ["the app's own scheme", "everglowmobile://join/k8Qm2", "k8Qm2"],
    ["a trailing slash", "https://everglow.social/join/k8Qm2/", "k8Qm2"],
    ["a query and a fragment", "https://everglow.social/join/k8Qm2?utm_source=x#top", "k8Qm2"],
  ])("reads %s", (_, input, token) => {
    expect(extractInvitationToken(input)).toBe(token);
  });

  test("keeps the input when there is no segment", () => {
    expect(extractInvitationToken("/")).toBe("/");
  });
});

describe("looksLikeInvite", () => {
  test.each([
    "https://everglow.social/join/k8Qm2",
    "everglow.social/join/k8Qm2",
    "  aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee  ",
  ])("offers %s", (text) => {
    expect(looksLikeInvite(text)).toBe(true);
  });

  test.each(["", "   ", "hello there", "see you at 8", "k8Qm2", `https://x.y/${"a".repeat(260)}`])(
    "leaves %s off the field",
    (text) => {
      expect(looksLikeInvite(text)).toBe(false);
    },
  );
});

describe("firstName", () => {
  test("names the host by their first name", () => {
    expect(firstName("Sam Rivera")).toBe("Sam");
    expect(firstName("  Jo  ")).toBe("Jo");
  });
});

describe("routeForIncomingLink", () => {
  test.each([
    ["everglowmobile://join/k8Qm2", "/join/k8Qm2"],
    ["everglowmobile://invite/k8Qm2", "/join/k8Qm2"],
    ["everglowmobile:///invite/k8Qm2/", "/join/k8Qm2"],
    ["/invite/k8Qm2", "/join/k8Qm2"],
    ["/join/k8Qm2?utm_source=x", "/join/k8Qm2"],
    ["https://events.everglow.app/invite/k8Qm2", "/join/k8Qm2"],
    ["https://everglow.social/join/k8Qm2", "/join/k8Qm2"],
  ])("sends %s to the envelope", (path, route) => {
    expect(routeForIncomingLink(path)).toBe(route);
  });

  test.each([
    "everglowmobile://design-kit",
    "/events/roll-1",
    "everglowmobile://example.auth0.com/ios/com.example/callback?code=abc",
    "/join",
    "/join/k8Qm2/extra",
  ])("leaves %s alone", (path) => {
    expect(routeForIncomingLink(path)).toBe(path);
  });
});
