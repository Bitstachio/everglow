import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useJoinEventForm } from "./use-join-event-form";
import { useEventsQuery } from "../api/queries";
import type { Event } from "../types";

export const useEventsScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { data: events = [], isLoading, isRefetching, error, errorUpdatedAt, refetch } = useEventsQuery(user?.id);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
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

  const onRefresh = () => {
    if (user?.id) void refetch({ cancelRefetch: false });
  };

  const { form, onSubmit, onScan } = useJoinEventForm({
    visible: joinModalVisible,
    onSuccess: (result) => {
      setJoinModalVisible(false);
      const wasAlreadyJoined = events.some((event) => event.id === result.id);
      Alert.alert(
        wasAlreadyJoined ? "Already Joined" : "Success",
        wasAlreadyJoined ? "You are already a member of this event." : "You have successfully joined the event!",
      );
    },
  });

  return {
    events,
    isLoading,
    refreshing: isRefetching,
    currentUserId: user?.id,
    profileInitial: user?.details?.name?.trim().charAt(0).toUpperCase() || "U",
    handleOpenAccountSettings: () => router.push("/account-settings"),
    joinModalVisible,
    selectedEvent,
    invitationModalVisible: selectedEvent !== null,
    onRefresh,
    form,
    onSubmit,
    handleJoinViaLink: onScan,
    handleOpenJoinModal: () => setJoinModalVisible(true),
    handleCloseJoinModal: () => {
      if (!form.formState.isSubmitting) setJoinModalVisible(false);
    },
    handleCreateEvent: () => router.push("/events/create"),
    handleEventShare: (event: Event) => setSelectedEvent(event),
    handleCloseInvitationModal: () => setSelectedEvent(null),
  };
};
