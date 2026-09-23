import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useEventsQuery } from "../api/queries";
import type { AccessLevel, Event } from "../types";
import {
  DEFAULT_EVENTS_LIST_FILTERS,
  DEFAULT_EVENTS_LIST_SORT,
  filterEvents,
  hasActiveEventsListFilters,
  sortEvents,
  toggleEventsListRole,
  type EventsListFilters,
  type EventsListSortDirection,
} from "../utils";

export const useEventsListScreen = () => {
  const { user } = useAuth();
  const { data: events = [], isLoading, isRefetching, error, errorUpdatedAt, refetch } = useEventsQuery(user?.id);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<EventsListFilters>(DEFAULT_EVENTS_LIST_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EventsListFilters>(DEFAULT_EVENTS_LIST_FILTERS);
  const [sortDirection, setSortDirection] = useState<EventsListSortDirection>(DEFAULT_EVENTS_LIST_SORT);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to fetch events"));
    }
  }, [error, errorUpdatedAt]);

  // Detail mutations invalidate list caches; still refresh on focus for peer updates.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) void refetch({ cancelRefetch: false });
    }, [refetch, user?.id]),
  );

  return {
    events: sortEvents(filterEvents(events, appliedFilters, user?.id), sortDirection),
    isLoading,
    refreshing: isRefetching,
    currentUserId: user?.id,
    selectedEvent,
    invitationModalVisible: selectedEvent !== null,
    filtersVisible,
    draftFilters,
    filtersActive: hasActiveEventsListFilters(appliedFilters),
    sortDirection,
    onRefresh: () => {
      if (user?.id) void refetch({ cancelRefetch: false });
    },
    handleEventShare: (event: Event) => setSelectedEvent(event),
    handleCloseInvitationModal: () => setSelectedEvent(null),
    handleOpenFilters: () => {
      setDraftFilters(appliedFilters);
      setFiltersVisible(true);
    },
    handleCloseFilters: () => setFiltersVisible(false),
    handleChangeFilterRole: (role: AccessLevel) =>
      setDraftFilters((current) => ({ ...current, roles: toggleEventsListRole(current.roles, role) })),
    handleChangeFilterDateFrom: (value: string | null) =>
      setDraftFilters((current) => ({ ...current, dateFrom: value })),
    handleChangeFilterDateTo: (value: string | null) => setDraftFilters((current) => ({ ...current, dateTo: value })),
    handleResetFilters: () => setDraftFilters(DEFAULT_EVENTS_LIST_FILTERS),
    handleApplyFilters: () => {
      setAppliedFilters(draftFilters);
      setFiltersVisible(false);
    },
    handleToggleSort: () => setSortDirection((current) => (current === "asc" ? "desc" : "asc")),
  };
};
