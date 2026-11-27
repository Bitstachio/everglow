import type { AccessLevel, Event, EventResponseDto } from "../types";
import { sortEvents, type EventsListSortDirection } from "../utils";
import type { GroupedRolls } from "./rolls";

export type HomeEventsGalleryStatus = EventResponseDto["galleryState"];

export type HomeEventsFilters = {
  statuses: HomeEventsGalleryStatus[];
  roles: AccessLevel[];
  sortDirection: EventsListSortDirection;
};

export const DEFAULT_HOME_EVENTS_FILTERS: HomeEventsFilters = {
  statuses: [],
  roles: [],
  sortDirection: "asc",
};

export const HOME_EVENTS_STATUS_OPTIONS: HomeEventsGalleryStatus[] = ["OPEN", "UPCOMING", "CLOSED"];

export const HOME_EVENTS_ROLE_OPTIONS: AccessLevel[] = ["ORGANIZER", "CONTRIBUTOR", "VIEWER"];

export const toggleHomeEventsFilterValue = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((current) => current !== value) : [...values, value];

/** Active means any narrowing filter — sort alone does not light the Filter control. */
export const hasActiveHomeEventsFilters = (filters: HomeEventsFilters) =>
  filters.statuses.length > 0 || filters.roles.length > 0;

/** Narrow the home list. Empty status/role selections mean “any”. */
export const filterHomeEvents = (events: Event[], filters: HomeEventsFilters): Event[] =>
  events.filter((event) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(event.galleryState)) return false;
    if (filters.roles.length > 0 && !filters.roles.includes(event.accessLevel)) return false;
    return true;
  });

/**
 * Order each gallery-state section by event date. Live / upcoming / closed
 * buckets stay; only the order inside them follows Earliest / Latest.
 */
export const sortHomeEventGroups = (groups: GroupedRolls, direction: EventsListSortDirection): GroupedRolls => ({
  live: sortEvents(groups.live, direction),
  upcoming: sortEvents(groups.upcoming, direction),
  closed: sortEvents(groups.closed, direction),
});
