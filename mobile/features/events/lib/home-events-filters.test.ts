import { buildEvent } from "../testing/fixtures";
import {
  DEFAULT_HOME_EVENTS_FILTERS,
  filterHomeEvents,
  hasActiveHomeEventsFilters,
  sortHomeEventGroups,
  toggleHomeEventsFilterValue,
} from "./home-events-filters";

test("empty filters are inactive; status or role turn them on", () => {
  expect(hasActiveHomeEventsFilters(DEFAULT_HOME_EVENTS_FILTERS)).toBe(false);
  expect(hasActiveHomeEventsFilters({ ...DEFAULT_HOME_EVENTS_FILTERS, sortDirection: "desc" })).toBe(false);
  expect(hasActiveHomeEventsFilters({ ...DEFAULT_HOME_EVENTS_FILTERS, statuses: ["OPEN"] })).toBe(true);
  expect(hasActiveHomeEventsFilters({ ...DEFAULT_HOME_EVENTS_FILTERS, roles: ["ORGANIZER"] })).toBe(true);
});

test("toggle adds and removes a filter value", () => {
  expect(toggleHomeEventsFilterValue(["OPEN"], "CLOSED")).toEqual(["OPEN", "CLOSED"]);
  expect(toggleHomeEventsFilterValue(["OPEN", "CLOSED"], "OPEN")).toEqual(["CLOSED"]);
});

test("filters by status and role", () => {
  const openHost = buildEvent({
    id: "open-host",
    galleryState: "OPEN",
    accessLevel: "ORGANIZER",
    date: "2026-06-01T12:00:00.000Z",
  });
  const upcomingGuest = buildEvent({
    id: "up-guest",
    galleryState: "UPCOMING",
    accessLevel: "PARTICIPANT",
    date: "2026-07-01T12:00:00.000Z",
  });
  const closedViewer = buildEvent({
    id: "closed-viewer",
    galleryState: "CLOSED",
    accessLevel: "VIEWER",
    date: "2026-05-01T12:00:00.000Z",
  });
  const events = [openHost, upcomingGuest, closedViewer];

  expect(filterHomeEvents(events, DEFAULT_HOME_EVENTS_FILTERS)).toEqual(events);
  expect(filterHomeEvents(events, { ...DEFAULT_HOME_EVENTS_FILTERS, statuses: ["OPEN"] }).map((e) => e.id)).toEqual([
    "open-host",
  ]);
  expect(
    filterHomeEvents(events, { ...DEFAULT_HOME_EVENTS_FILTERS, roles: ["PARTICIPANT", "VIEWER"] }).map((e) => e.id),
  ).toEqual(["up-guest", "closed-viewer"]);
});

test("sorts each gallery-state group by event date", () => {
  const early = buildEvent({ id: "early", date: "2026-01-01T00:00:00.000Z", galleryState: "OPEN" });
  const late = buildEvent({ id: "late", date: "2026-12-01T00:00:00.000Z", galleryState: "OPEN" });
  const groups = { live: [late, early], upcoming: [], closed: [] };

  expect(sortHomeEventGroups(groups, "asc").live.map((e) => e.id)).toEqual(["early", "late"]);
  expect(sortHomeEventGroups(groups, "desc").live.map((e) => e.id)).toEqual(["late", "early"]);
});
