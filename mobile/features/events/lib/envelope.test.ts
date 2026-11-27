import { buildEvent } from "../testing/fixtures";
import { closedOn, envelopeAccessLevel, envelopeCount, envelopeState, envelopeUrl } from "./envelope";

test("each envelope carries the invite for its access level", () => {
  const event = buildEvent();
  expect(envelopeUrl(event, "participant")).toBe("https://events.everglow.app/invite/weekend");
  expect(envelopeUrl(event, "viewer")).toBe("https://events.everglow.app/invite/weekend-viewer");
  expect(envelopeAccessLevel("participant")).toBe("PARTICIPANT");
  expect(envelopeAccessLevel("viewer")).toBe("VIEWER");
});

test("an envelope has no link when the API listed no invites", () => {
  expect(envelopeUrl(buildEvent({ invites: [] }), "participant")).toBeNull();
});

test("an envelope admits people only while the roll is open and in good standing", () => {
  expect(envelopeState(buildEvent())).toBe("open");
  expect(envelopeState(buildEvent({ galleryState: "UPCOMING" }))).toBe("open");
  expect(envelopeState(buildEvent({ status: "UNDER_REVIEW" }))).toBe("onHold");
  expect(envelopeState(buildEvent({ status: "SUSPENDED" }))).toBe("suspended");
  expect(envelopeState(buildEvent({ galleryState: "CLOSED", status: "UNDER_REVIEW" }))).toBe("closed");
});

test("a closed roll closed when an organizer cut it, or when its window ran out", () => {
  const event = buildEvent({ galleryClosesAt: "2026-09-21T10:00:00.000Z" });
  expect(closedOn(event)).toBe("2026-09-21T10:00:00.000Z");
  expect(closedOn({ ...event, deactivatedAt: "2026-09-15T10:00:00.000Z" })).toBe("2026-09-15T10:00:00.000Z");
  expect(closedOn({ ...event, galleryClosesAt: null })).toBe(event.updatedAt);
});

test("counts the envelopes the API listed an invite for, leaving out any other role", () => {
  expect(envelopeCount(buildEvent())).toBe(2);
  expect(
    envelopeCount(buildEvent({ invites: [{ accessLevel: "VIEWER", invitationUrl: "https://events.everglow.app/v" }] })),
  ).toBe(1);
  expect(envelopeCount(buildEvent({ invites: [] }))).toBe(0);
});
