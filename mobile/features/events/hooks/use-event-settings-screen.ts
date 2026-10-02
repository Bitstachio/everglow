import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";
import { useDeleteEventMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { formatEventDateTime } from "../utils";
import { useChangeEventCover } from "./use-change-event-cover";

export const useEventSettingsScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const deleteEventMutation = useDeleteEventMutation();
  const { isUpdatingCover, handleChangeCover } = useChangeEventCover(eventId ?? "", Boolean(eventQuery.data?.coverUrl));

  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const currentParticipant = participants.find((participant) => participant.userId === user?.id);
  const isAdmin = event?.creatorId === user?.id || currentParticipant?.accessLevel === "ORGANIZER";
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;

  useEffect(() => {
    if (!eventQuery.isError) return;
    Alert.alert("Error", getErrorMessage(eventQuery.error, "Failed to load event settings"));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, router]);

  useEffect(() => {
    if (isLoading || !event) return;
    if (!isAdmin) router.back();
  }, [isLoading, event, isAdmin, router]);

  const dateSummary = event
    ? (() => {
        const { date, time } = formatEventDateTime(event.date);
        return `${date} · ${time}`;
      })()
    : "";

  const coverSummary = isUpdatingCover ? "Updating cover…" : event?.coverUrl ? "Change or remove the cover" : "Not set";

  return {
    event,
    isLoading: isLoading || !event || !isAdmin,
    isDeleting: deleteEventMutation.isPending,
    dateSummary,
    coverSummary,
    isUpdatingCover,
    handleChangeCover,
    handleOpenTitle: () => {
      if (!eventId) return;
      router.push(`/events/${eventId}/edit-title`);
    },
    handleOpenDescription: () => {
      if (!eventId) return;
      router.push(`/events/${eventId}/edit-description`);
    },
    handleOpenDate: () => {
      if (!eventId) return;
      router.push(`/events/${eventId}/edit-date`);
    },
    handleDeleteEvent: () => {
      if (!eventId) return;

      Alert.alert("Delete Event", "Are you sure you want to delete this event? This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteEventMutation.mutate(eventId, {
              onSuccess: () => {
                Alert.alert("Success", "Event deleted successfully");
                router.replace("/events");
              },
              onError: (error) => {
                Alert.alert("Error", getErrorMessage(error, "Failed to delete event"));
              },
            });
          },
        },
      ]);
    },
  };
};
