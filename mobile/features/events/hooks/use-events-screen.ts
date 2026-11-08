import { useAuth } from "@/context/auth-context";
import { getErrorMessage, isConnectionError } from "@/lib/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { eventsKeys } from "../api/keys";
import { useEventsQuery } from "../api/queries";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { LEAVE_MOTION, LEAVE_SETTLE_MS, takeLeftRoll, type LeftRoll } from "../lib/left-roll";
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

  // A connection error keeps the last-loaded rolls on screen (03.5); any other
  // failure is unexpected, so surface it.
  const isOffline = isError && isConnectionError(error);
  useEffect(() => {
    if (isError && !isConnectionError(error)) {
      Alert.alert(t("failedTitle"), getErrorMessage(error, t("common:actions.tryAgain")));
    }
  }, [isError, error, errorUpdatedAt, t]);

  // The roll you just left keeps its card in place ("holding"), then the card
  // goes and the list closes up ("going"). That is the confirmation. Reduce
  // Motion shows Home without it straight away.
  const reduceMotion = useReduceMotion();
  const [leaving, setLeaving] = useState<{ roll: LeftRoll; phase: "holding" | "going" } | null>(null);

  // Legacy detail pages do not invalidate queries yet. Refresh when returning.
  useFocusEffect(
    useCallback(() => {
      const roll = takeLeftRoll();
      if (roll) setLeaving({ roll, phase: "holding" });
      if (user?.id) void refetch({ cancelRefetch: false });
    }, [refetch, user?.id]),
  );

  useEffect(() => {
    // Under Reduce Motion the phases still run out, but nothing shows them.
    if (!leaving) return;
    const timer =
      leaving.phase === "holding"
        ? setTimeout(() => setLeaving({ ...leaving, phase: "going" }), LEAVE_MOTION.holdMs)
        : setTimeout(() => setLeaving(null), LEAVE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  // The list has already dropped the roll you left; it stays on screen until it goes.
  const leavingEvent = leaving?.roll.event;
  const holding = leaving?.phase === "holding" && !reduceMotion;
  const shown = useMemo(() => {
    if (!leavingEvent) return events;
    const others = events.filter((event) => event.id !== leavingEvent.id);
    return holding ? [...others, leavingEvent] : others;
  }, [events, leavingEvent, holding]);
  const groups = useMemo(() => groupRolls(shown), [shown]);
  const hasRolls = shown.length > 0;

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

  return {
    groups,
    /** The roll going from the list, while it goes: its id and the strip it had. */
    leavingRoll: leaving && !reduceMotion ? { id: leaving.roll.event.id, photos: leaving.roll.photos } : null,
    hasRolls,
    isLoading,
    isRefreshing: isRefetching,
    isOffline,
    savedAtLabel,
    now,
    profileAvatar: { userId: user?.id ?? "", name: user?.details?.name, uri: user?.details?.avatarUrl },
    onRefresh: () => {
      if (!user?.id) return;
      void refetch({ cancelRefetch: false });
      // The strips load separately, so pulling down refreshes them too.
      for (const event of groups.live) {
        void queryClient.invalidateQueries({ queryKey: eventsKeys.preview(event.id, ROLL_FRAMES) });
      }
    },
    onNewEvent: () => router.push("/events/create"),
    // 06.1: the header's scanner and "Join with an envelope" both open the scanner.
    onScan: () => router.push("/join"),
    onOpenRoll: (event: Event) => router.push(`/events/${event.id}`),
    onOpenCard: () => router.push("/account-settings"),
  };
};
