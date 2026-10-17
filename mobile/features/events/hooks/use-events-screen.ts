import { useAuth } from "@/context/auth-context";
import { getErrorMessage, isConnectionError } from "@/lib/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useJoinEventForm } from "./use-join-event-form";
import { eventsKeys } from "../api/keys";
import { useEventsQuery } from "../api/queries";
import { groupRolls, hasClosed, isLastDay, ROLL_FRAMES } from "../lib/rolls";
import type { Event } from "../types";

const MINUTE_MS = 60 * 1000;

export const useEventsScreen = () => {
  const { t } = useTranslation(["home", "common"]);
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
      Alert.alert(t("failedTitle"), getErrorMessage(error, t("common:actions.tryAgain")));
    }
  }, [isError, error, errorUpdatedAt, t]);

  // Legacy detail pages do not invalidate queries yet. Refresh when returning.
  useFocusEffect(
    useCallback(() => {
      if (user?.id) void refetch({ cancelRefetch: false });
    }, [refetch, user?.id]),
  );

  const groups = useMemo(() => groupRolls(events), [events]);
  const hasRolls = events.length > 0;

  // A roll on its last day counts down by the minute (03.3). One that closes
  // while Home is open is fetched again, so it moves below with the closed ones.
  const [now, setNow] = useState(() => new Date());
  const countingDown = groups.live.some((event) => isLastDay(event, now));
  useEffect(() => {
    if (!countingDown) return;
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [countingDown]);
  const rollClosed = groups.live.some((event) => hasClosed(event, now));
  useEffect(() => {
    if (rollClosed) void refetch({ cancelRefetch: false });
  }, [rollClosed, refetch]);

  const savedAtLabel = useMemo(
    () =>
      dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
        : null,
    [dataUpdatedAt],
  );

  const { form, onSubmit, onScan } = useJoinEventForm({
    visible: joinSheetVisible,
    // Joined or already in, the roll simply opens (06.6–06.7).
    onSuccess: (result) => {
      setJoinSheetVisible(false);
      router.push(`/events/${result.id}`);
    },
  });

  return {
    groups,
    hasRolls,
    isLoading,
    isRefreshing: isRefetching,
    isOffline,
    savedAtLabel,
    now,
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
