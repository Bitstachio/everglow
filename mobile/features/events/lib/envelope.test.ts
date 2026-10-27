import { buildEvent } from "../testing/fixtures";
import { envelopeAccessLevel, envelopeUrl, formatEnvelopeDate } from "./envelope";

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
});
