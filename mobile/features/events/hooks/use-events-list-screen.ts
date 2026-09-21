import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useEventsQuery } from "../api/queries";
import type { Event } from "../types";

export const useEventsListScreen = () => {
  const { user } = useAuth();
  const { data: events = [], isLoading, isRefetching, error, errorUpdatedAt, refetch } = useEventsQuery(user?.id);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

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
    events,
    isLoading,
    refreshing: isRefetching,
    currentUserId: user?.id,
    selectedEvent,
    invitationModalVisible: selectedEvent !== null,
    onRefresh: () => {
      if (user?.id) void refetch({ cancelRefetch: false });
    },
    handleEventShare: (event: Event) => setSelectedEvent(event),
    handleCloseInvitationModal: () => setSelectedEvent(null),
  };
};
