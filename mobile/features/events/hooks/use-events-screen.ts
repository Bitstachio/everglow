import { useAuth } from "@/context/auth-context";
import { getErrorMessage, isConnectionError } from "@/lib/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useJoinEventForm } from "./use-join-event-form";
import { eventsKeys } from "../api/keys";
import { useEventsQuery } from "../api/queries";
import { groupRolls, ROLL_FRAMES } from "../lib/rolls";
import type { Event } from "../types";

export const useEventsScreen = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    data: events = [],
    isLoading,
    isRefetching,
    isError,
    error,
    errorUpdatedAt,
    dataUpdatedAt,
    refetch,
  } = useEventsQuery(user?.id);
  const [joinSheetVisible, setJoinSheetVisible] = useState(false);

  // A connection error keeps the last-loaded rolls on screen (03.5); any other
  // failure is unexpected, so surface it.
  const isOffline = isError && isConnectionError(error);
  useEffect(() => {
    if (isError && !isConnectionError(error)) {
      Alert.alert("Error", getErrorMessage(error, "Failed to fetch events"));
    }
  }, [isError, error, errorUpdatedAt]);

  // Legacy detail pages do not invalidate queries yet. Refresh when returning.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) void refetch({ cancelRefetch: false });
    }, [refetch, user?.id]),
  );

  const groups = useMemo(() => groupRolls(events), [events]);
  const hasRolls = events.length > 0;

  const savedAtLabel = useMemo(
    () =>
      dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
        : null,
    [dataUpdatedAt],
  );

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
    groups,
    hasRolls,
    isLoading,
    isRefreshing: isRefetching,
    isOffline,
    savedAtLabel,
    profileAvatar: { userId: user?.id ?? "", name: user?.details?.name, uri: user?.details?.avatarUrl },
    joinSheetVisible,
    form,
    onSubmit,
    onScanViaSheet: onScan,
    onRefresh: () => {
      if (!user?.id) return;
      void refetch({ cancelRefetch: false });
      // The strips load separately, so pulling down refreshes them too.
      for (const event of groups.live) {
        void queryClient.invalidateQueries({ queryKey: eventsKeys.preview(event.id, ROLL_FRAMES) });
      }
    },
    onNewEvent: () => router.push("/events/create"),
    onScan: () => setJoinSheetVisible(true),
    onOpenRoll: (event: Event) => router.push(`/events/${event.id}`),
    onOpenCard: () => router.push("/account-settings"),
    onCloseJoinSheet: () => {
      if (!form.formState.isSubmitting) setJoinSheetVisible(false);
    },
  };
};
