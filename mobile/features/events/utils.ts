import type { AccessLevel, Event } from "./types";

export type EventsListFilters = {
  role: AccessLevel | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export const DEFAULT_EVENTS_LIST_FILTERS: EventsListFilters = {
  role: null,
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

export const filterEvents = (events: Event[], filters: EventsListFilters, currentUserId?: string): Event[] =>
  events.filter((event) => {
    if (filters.role && currentUserId && !eventMatchesRole(event, filters.role, currentUserId)) {
      return false;
    }

    const day = eventDay(event.date);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    return true;
  });

export const hasActiveEventsListFilters = (filters: EventsListFilters) =>
  filters.role !== null || filters.dateFrom !== null || filters.dateTo !== null;
