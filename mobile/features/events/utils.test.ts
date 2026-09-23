import { buildEvent } from "./testing/fixtures";
import {
  DEFAULT_EVENTS_LIST_FILTERS,
  displayFilterDay,
  filterEvents,
  formatEventDateTime,
  formatFilterDay,
  getAccessLevelLabel,
  hasActiveEventsListFilters,
  sortEvents,
  toggleEventsListRole,
} from "./utils";

test("formats event date and time for detail display", () => {
  const { date, time } = formatEventDateTime("2026-09-20T15:30:00.000Z");
  expect(date.length).toBeGreaterThan(0);
  expect(time.length).toBeGreaterThan(0);
});

test.each([
  ["ORGANIZER", "Organizer"],
  ["PARTICIPANT", "Participant"],
  ["VIEWER", "Viewer"],
] as const)("labels access level %s", (level, label) => {
  expect(getAccessLevelLabel(level)).toBe(label);
});

test("returns all events when filters are empty", () => {
  const events = [buildEvent(), buildEvent({ id: "event-2", creatorId: "user-2" })];
  expect(filterEvents(events, DEFAULT_EVENTS_LIST_FILTERS, "user-1")).toEqual(events);
});

test("filters organizers by creator id", () => {
  const mine = buildEvent();
  const theirs = buildEvent({ id: "event-2", creatorId: "user-2", title: "Picnic" });
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, roles: ["ORGANIZER"] }, "user-1")).toEqual([
    mine,
  ]);
});

test("filters non-organizer roles to events the user did not create", () => {
  const mine = buildEvent();
  const theirs = buildEvent({ id: "event-2", creatorId: "user-2", title: "Picnic" });
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, roles: ["PARTICIPANT"] }, "user-1")).toEqual([
    theirs,
  ]);
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, roles: ["VIEWER"] }, "user-1")).toEqual([
    theirs,
  ]);
});

test("matches events that satisfy any selected role", () => {
  const mine = buildEvent();
  const theirs = buildEvent({ id: "event-2", creatorId: "user-2", title: "Picnic" });
  expect(
    filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, roles: ["ORGANIZER", "PARTICIPANT"] }, "user-1"),
  ).toEqual([mine, theirs]);
});

test("filters by inclusive date range on the event calendar day", () => {
  const early = buildEvent({ id: "early", date: "2026-09-10T12:00:00.000Z" });
  const mid = buildEvent({ id: "mid", date: "2026-09-20T15:30:00.000Z" });
  const late = buildEvent({ id: "late", date: "2026-09-30T09:00:00.000Z" });
  expect(
    filterEvents([early, mid, late], { roles: [], dateFrom: "2026-09-15", dateTo: "2026-09-25" }, "user-1"),
  ).toEqual([mid]);
});

test("sorts events by date ascending and descending without mutating input", () => {
  const early = buildEvent({ id: "early", date: "2026-09-10T12:00:00.000Z" });
  const mid = buildEvent({ id: "mid", date: "2026-09-20T15:30:00.000Z" });
  const late = buildEvent({ id: "late", date: "2026-09-30T09:00:00.000Z" });
  const input = [late, early, mid];
  expect(sortEvents(input, "asc").map((event) => event.id)).toEqual(["early", "mid", "late"]);
  expect(sortEvents(input, "desc").map((event) => event.id)).toEqual(["late", "mid", "early"]);
  expect(input.map((event) => event.id)).toEqual(["late", "early", "mid"]);
});

test("toggles roles for multi-select filters", () => {
  expect(toggleEventsListRole([], "ORGANIZER")).toEqual(["ORGANIZER"]);
  expect(toggleEventsListRole(["ORGANIZER"], "PARTICIPANT")).toEqual(["ORGANIZER", "PARTICIPANT"]);
  expect(toggleEventsListRole(["ORGANIZER", "PARTICIPANT"], "ORGANIZER")).toEqual(["PARTICIPANT"]);
});

test("detects active filters", () => {
  expect(hasActiveEventsListFilters(DEFAULT_EVENTS_LIST_FILTERS)).toBe(false);
  expect(hasActiveEventsListFilters({ ...DEFAULT_EVENTS_LIST_FILTERS, roles: ["ORGANIZER"] })).toBe(true);
  expect(hasActiveEventsListFilters({ ...DEFAULT_EVENTS_LIST_FILTERS, dateFrom: "2026-09-01" })).toBe(true);
});

test("formats filter days for storage and display", () => {
  expect(formatFilterDay(new Date(2026, 8, 15))).toBe("2026-09-15");
  expect(displayFilterDay(null)).toBe("Select date");
  expect(displayFilterDay("2026-09-15")).toContain("2026");
});
