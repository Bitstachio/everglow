import { useState } from "react";
import type { AccessLevel } from "../types";
import {
  DEFAULT_HOME_EVENTS_FILTERS,
  hasActiveHomeEventsFilters,
  toggleHomeEventsFilterValue,
  type HomeEventsFilters,
  type HomeEventsGalleryStatus,
} from "../lib/home-events-filters";
import type { EventsListSortDirection } from "../utils";

/** Sheet draft / applied state for home Filter. Does not filter the list yet. */
export const useHomeEventsFilters = () => {
  const [visible, setVisible] = useState(false);
  const [applied, setApplied] = useState<HomeEventsFilters>(DEFAULT_HOME_EVENTS_FILTERS);
  const [draft, setDraft] = useState<HomeEventsFilters>(DEFAULT_HOME_EVENTS_FILTERS);

  return {
    filtersVisible: visible,
    draftFilters: draft,
    filtersActive: hasActiveHomeEventsFilters(applied),
    openFilters: () => {
      setDraft(applied);
      setVisible(true);
    },
    closeFilters: () => setVisible(false),
    toggleStatus: (status: HomeEventsGalleryStatus) =>
      setDraft((current) => ({
        ...current,
        statuses: toggleHomeEventsFilterValue(current.statuses, status),
      })),
    toggleRole: (role: AccessLevel) =>
      setDraft((current) => ({
        ...current,
        roles: toggleHomeEventsFilterValue(current.roles, role),
      })),
    setSortDirection: (sortDirection: EventsListSortDirection) =>
      setDraft((current) => ({ ...current, sortDirection })),
    resetFilters: () => setDraft(DEFAULT_HOME_EVENTS_FILTERS),
    applyFilters: () => {
      setApplied(draft);
      setVisible(false);
    },
  };
};
