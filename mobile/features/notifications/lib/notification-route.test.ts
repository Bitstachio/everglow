import { notificationRoute, rollIdOf } from "./notification-route";

const ID = "11111111-1111-4111-8111-111111111111";

describe("notificationRoute", () => {
  it.each([
    [`/events/${ID}`, `/events/${ID}`],
    [`/events/${ID}/envelope`, `/events/${ID}/envelope`],
    [`/events/${ID}/tray`, `/events/${ID}/tray`],
    [`/events/${ID.toUpperCase()}`, `/events/${ID.toUpperCase()}`],
    // Screen params are the app's own: a payload can't pass them.
    [`/events/${ID}?arrival=joined&place=1`, `/events/${ID}`],
    [`/events/${ID}#frames`, `/events/${ID}`],
    [`/events/${ID}/tray?x=1#y`, `/events/${ID}/tray`],
  ])("opens %s as %s", (url, route) => {
    expect(notificationRoute({ url, type: "TEST" })).toBe(route);
  });

  it.each([
    ["no data", undefined],
    ["no url", { type: "TEST" }],
    ["Home", { url: "/" }],
    ["a full URL", { url: "https://evil.example/events" }],
    ["a protocol-relative URL", { url: "//evil.example" }],
    ["a URL that is not a string", { url: 42 }],
    ["sign-in", { url: "/login" }],
    ["account deletion", { url: "/delete-account" }],
    ["the deleted screen", { url: "/account-deleted" }],
    ["onboarding", { url: "/onboarding/username" }],
    ["a roll id that is not a uuid", { url: "/events/abc" }],
    ["a roll's settings", { url: `/events/${ID}/settings` }],
    ["a path under a roll screen", { url: `/events/${ID}/tray/x` }],
    ["a path that only starts like a roll", { url: `/events/${ID}x` }],
    ["the roll list", { url: "/events/list" }],
    ["a join link", { url: "/join/token" }],
  ])("opens nothing for %s", (_label, data) => {
    expect(notificationRoute(data)).toBeNull();
  });
});

describe("rollIdOf", () => {
  it.each([
    [`/events/${ID}`, ID],
    [`/events/${ID}/settings`, ID],
    [`/events/${ID.toUpperCase()}/tray`, ID],
    ["/events", null],
    ["/events/list", null],
    [null, null],
  ])("finds the roll in %s", (path, id) => {
    expect(rollIdOf(path)).toBe(id);
  });
});
