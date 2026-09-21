import { buildEvent } from "./testing/fixtures";
import {
  DEFAULT_EVENTS_LIST_FILTERS,
  displayFilterDay,
  filterEvents,
  formatFilterDay,
  hasActiveEventsListFilters,
} from "./utils";

test("returns all events when filters are empty", () => {
  const events = [buildEvent(), buildEvent({ id: "event-2", creatorId: "user-2" })];
  expect(filterEvents(events, DEFAULT_EVENTS_LIST_FILTERS, "user-1")).toEqual(events);
});

test("filters organizers by creator id", () => {
  const mine = buildEvent();
  const theirs = buildEvent({ id: "event-2", creatorId: "user-2", title: "Picnic" });
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, role: "ORGANIZER" }, "user-1")).toEqual([mine]);
});

test("filters non-organizer roles to events the user did not create", () => {
  const mine = buildEvent();
  const theirs = buildEvent({ id: "event-2", creatorId: "user-2", title: "Picnic" });
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, role: "PARTICIPANT" }, "user-1")).toEqual([
    theirs,
  ]);
  expect(filterEvents([mine, theirs], { ...DEFAULT_EVENTS_LIST_FILTERS, role: "VIEWER" }, "user-1")).toEqual([theirs]);
});

test("filters by inclusive date range on the event calendar day", () => {
  const early = buildEvent({ id: "early", date: "2026-09-10T12:00:00.000Z" });
  const mid = buildEvent({ id: "mid", date: "2026-09-20T15:30:00.000Z" });
  const late = buildEvent({ id: "late", date: "2026-09-30T09:00:00.000Z" });
  expect(
    filterEvents([early, mid, late], { role: null, dateFrom: "2026-09-15", dateTo: "2026-09-25" }, "user-1"),
  ).toEqual([mid]);
});

test("detects active filters", () => {
  expect(hasActiveEventsListFilters(DEFAULT_EVENTS_LIST_FILTERS)).toBe(false);
  expect(hasActiveEventsListFilters({ ...DEFAULT_EVENTS_LIST_FILTERS, role: "ORGANIZER" })).toBe(true);
  expect(hasActiveEventsListFilters({ ...DEFAULT_EVENTS_LIST_FILTERS, dateFrom: "2026-09-01" })).toBe(true);
});

test("formats filter days for storage and display", () => {
  expect(formatFilterDay(new Date(2026, 8, 15))).toBe("2026-09-15");
  expect(displayFilterDay(null)).toBe("Select date");
  expect(displayFilterDay("2026-09-15")).toContain("2026");
});
