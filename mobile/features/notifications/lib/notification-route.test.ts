import { notificationRoute } from "./notification-route";

describe("notificationRoute", () => {
  it("opens an app path from the notification's data", () => {
    expect(notificationRoute({ url: "/events/abc", type: "TEST" })).toBe("/events/abc");
  });

  it.each([
    ["no data", undefined],
    ["no url", { type: "TEST" }],
    ["a full URL", { url: "https://evil.example/events" }],
    ["a protocol-relative URL", { url: "//evil.example" }],
    ["a URL that is not a string", { url: 42 }],
  ])("opens nothing for %s", (_label, data) => {
    expect(notificationRoute(data)).toBeNull();
  });
});
