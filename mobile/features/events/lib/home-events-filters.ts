import type { AccessLevel, EventResponseDto } from "../types";
import type { EventsListSortDirection } from "../utils";

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

export const HOME_EVENTS_ROLE_OPTIONS: AccessLevel[] = ["ORGANIZER", "PARTICIPANT", "VIEWER"];

export const toggleHomeEventsFilterValue = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((current) => current !== value) : [...values, value];

/** Active means any narrowing filter — sort alone does not light the Filter control. */
export const hasActiveHomeEventsFilters = (filters: HomeEventsFilters) =>
  filters.statuses.length > 0 || filters.roles.length > 0;
