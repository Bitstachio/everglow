import type { AccessLevel, Event } from "./types";

export const formatEventDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

export const getAccessLevelLabel = (accessLevel: AccessLevel) => {
  switch (accessLevel) {
    case "ORGANIZER":
      return "Organizer";
    case "PARTICIPANT":
      return "Participant";
    case "VIEWER":
      return "Viewer";
    default:
      return accessLevel;
  }
};

export type EventsListFilters = {
  roles: AccessLevel[];
  dateFrom: string | null;
  dateTo: string | null;
};

export const DEFAULT_EVENTS_LIST_FILTERS: EventsListFilters = {
  roles: [],
  dateFrom: null,
  dateTo: null,
};

export const EVENT_ROLE_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "ORGANIZER", label: "Organizer" },
  { value: "PARTICIPANT", label: "Participant" },
  { value: "VIEWER", label: "Viewer" },
];

const eventDay = (isoDate: string) => isoDate.slice(0, 10);

export const parseFilterDay = (value: string | null): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatFilterDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const displayFilterDay = (value: string | null) =>
  value
    ? parseFilterDay(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Select date";

/** Role uses creatorId until list responses include the caller's accessLevel. */
export const eventMatchesRole = (event: Event, role: AccessLevel, currentUserId: string) => {
  const isOrganizer = event.creatorId === currentUserId;
  if (role === "ORGANIZER") return isOrganizer;
  return !isOrganizer;
};

export const toggleEventsListRole = (roles: AccessLevel[], role: AccessLevel): AccessLevel[] =>
  roles.includes(role) ? roles.filter((current) => current !== role) : [...roles, role];

export type EventsListSortDirection = "asc" | "desc";

export const DEFAULT_EVENTS_LIST_SORT: EventsListSortDirection = "asc";

export const filterEvents = (events: Event[], filters: EventsListFilters, currentUserId?: string): Event[] =>
  events.filter((event) => {
    if (
      filters.roles.length > 0 &&
      currentUserId &&
      !filters.roles.some((role) => eventMatchesRole(event, role, currentUserId))
    ) {
      return false;
    }

    const day = eventDay(event.date);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    return true;
  });

export const sortEvents = (events: Event[], direction: EventsListSortDirection): Event[] =>
  [...events].sort((a, b) => {
    const delta = a.date.localeCompare(b.date);
    return direction === "asc" ? delta : -delta;
  });

export const hasActiveEventsListFilters = (filters: EventsListFilters) =>
  filters.roles.length > 0 || filters.dateFrom !== null || filters.dateTo !== null;
