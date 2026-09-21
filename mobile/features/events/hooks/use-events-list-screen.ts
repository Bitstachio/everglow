import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useEventsQuery } from "../api/queries";
import type { AccessLevel, Event } from "../types";
import {
  DEFAULT_EVENTS_LIST_FILTERS,
  filterEvents,
  hasActiveEventsListFilters,
  type EventsListFilters,
} from "../utils";

export const useEventsListScreen = () => {
  const { user } = useAuth();
  const { data: events = [], isLoading, isRefetching, error, errorUpdatedAt, refetch } = useEventsQuery(user?.id);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<EventsListFilters>(DEFAULT_EVENTS_LIST_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EventsListFilters>(DEFAULT_EVENTS_LIST_FILTERS);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to fetch events"));
    }
  }, [error, errorUpdatedAt]);

  // Legacy detail pages do not invalidate queries yet. Refresh when returning.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) void refetch({ cancelRefetch: false });
    }, [refetch, user?.id]),
  );

  return {
    events: filterEvents(events, appliedFilters, user?.id),
    isLoading,
    refreshing: isRefetching,
    currentUserId: user?.id,
    selectedEvent,
    invitationModalVisible: selectedEvent !== null,
    filtersVisible,
    draftFilters,
    filtersActive: hasActiveEventsListFilters(appliedFilters),
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
    handleChangeFilterRole: (role: AccessLevel | null) => setDraftFilters((current) => ({ ...current, role })),
    handleChangeFilterDateFrom: (value: string | null) => setDraftFilters((current) => ({ ...current, dateFrom: value })),
    handleChangeFilterDateTo: (value: string | null) => setDraftFilters((current) => ({ ...current, dateTo: value })),
    handleResetFilters: () => setDraftFilters(DEFAULT_EVENTS_LIST_FILTERS),
    handleApplyFilters: () => {
      setAppliedFilters(draftFilters);
      setFiltersVisible(false);
    },
  };
};
