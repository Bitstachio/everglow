import { buildEvent } from "../testing/fixtures";
import {
  closedOn,
  envelopeAccessLevel,
  envelopeState,
  envelopeUrl,
  formatEnvelopeDate,
  formatEnvelopeDay,
} from "./envelope";

test("each envelope carries the invite for its access level", () => {
  const event = buildEvent();
  expect(envelopeUrl(event, "adds")).toBe("https://events.everglow.app/invite/weekend");
  expect(envelopeUrl(event, "view")).toBe("https://events.everglow.app/invite/weekend-viewer");
  expect(envelopeAccessLevel("adds")).toBe("PARTICIPANT");
  expect(envelopeAccessLevel("view")).toBe("VIEWER");
});

test("an envelope has no link when the API listed no invites", () => {
  expect(envelopeUrl(buildEvent({ invites: [] }), "adds")).toBeNull();
});

test("writes the roll's date the way the lab fills it in", () => {
  expect(formatEnvelopeDate(new Date(2026, 10, 7, 19, 0).toISOString())).toBe("Sat 7 Nov, 7 pm");
  expect(formatEnvelopeDate(new Date(2026, 10, 7, 19, 30).toISOString())).toBe("Sat 7 Nov, 7:30 pm");
  expect(formatEnvelopeDate(new Date(2026, 10, 8, 0, 5).toISOString())).toBe("Sun 8 Nov, 12:05 am");
  expect(formatEnvelopeDate(new Date(2026, 10, 8, 12, 0).toISOString())).toBe("Sun 8 Nov, 12 pm");
  expect(formatEnvelopeDate(new Date(2026, 8, 12, 18, 0).toISOString())).toBe("Sat 12 Sep, 6 pm");
});

test("writes a day with a three-letter month", () => {
  expect(formatEnvelopeDay(new Date(2026, 8, 21, 12, 0).toISOString())).toBe("21 Sep");
  expect(formatEnvelopeDay(new Date(2026, 10, 14, 12, 0).toISOString())).toBe("14 Nov");
});

test("an envelope admits people only while the roll is open and in good standing", () => {
  expect(envelopeState(buildEvent())).toBe("open");
  expect(envelopeState(buildEvent({ galleryState: "UPCOMING" }))).toBe("open");
  expect(envelopeState(buildEvent({ status: "UNDER_REVIEW" }))).toBe("onHold");
  expect(envelopeState(buildEvent({ status: "SUSPENDED" }))).toBe("suspended");
  expect(envelopeState(buildEvent({ galleryState: "CLOSED", status: "UNDER_REVIEW" }))).toBe("closed");
});

test("a closed roll closed when a host cut it, or when its window ran out", () => {
  const event = buildEvent({ galleryClosesAt: "2026-09-21T10:00:00.000Z" });
  expect(closedOn(event)).toBe("2026-09-21T10:00:00.000Z");
  expect(closedOn({ ...event, deactivatedAt: "2026-09-15T10:00:00.000Z" })).toBe("2026-09-15T10:00:00.000Z");
  expect(closedOn({ ...event, galleryClosesAt: null })).toBe(event.updatedAt);
});
