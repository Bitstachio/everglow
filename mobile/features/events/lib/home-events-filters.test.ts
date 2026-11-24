import {
  DEFAULT_HOME_EVENTS_FILTERS,
  hasActiveHomeEventsFilters,
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
