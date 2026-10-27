import { extractInvitationToken, firstName, formatEnvelopeDate, formatPickUpDate, looksLikeInvite } from "./invite";

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

describe("formatting", () => {
  test("prints when a roll happens the way the envelope does", () => {
    expect(formatEnvelopeDate(new Date(2026, 9, 18, 16, 0).toISOString())).toBe("Sun 18 Oct, 4 pm");
    expect(formatEnvelopeDate(new Date(2026, 10, 7, 19, 30).toISOString())).toBe("Sat 7 Nov, 7:30 pm");
    expect(formatEnvelopeDate(new Date(2026, 10, 7, 0, 5).toISOString())).toBe("Sat 7 Nov, 12:05 am");
  });

  test("prints the pick-up day", () => {
    expect(formatPickUpDate(new Date(2026, 10, 17, 12).toISOString())).toBe("17 Nov");
  });

  test("names the host by their first name", () => {
    expect(firstName("Sam Rivera")).toBe("Sam");
    expect(firstName("  Jo  ")).toBe("Jo");
  });
});
