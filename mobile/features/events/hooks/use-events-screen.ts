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
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);
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
    visible: joinSheetVisible,
    onSuccess: (result) => {
      setJoinSheetVisible(false);
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
    joinSheetVisible,
    selectedEvent,
    invitationModalVisible: selectedEvent !== null,
    onRefresh,
    form,
    onSubmit,
    handleJoinViaLink: onScan,
    handleOpenJoinSheet: () => setJoinSheetVisible(true),
    handleCloseJoinSheet: () => {
      if (!form.formState.isSubmitting) setJoinSheetVisible(false);
    },
    handleCreateEvent: () => router.push("/events/create"),
    handleEventShare: (event: Event) => setSelectedEvent(event),
    handleCloseInvitationModal: () => setSelectedEvent(null),
  };
};
