import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { formatClosesUntil, formatOpensAt, rollRole, storagePair } from "../lib/roll-page";

/** Roll settings for upcoming and open galleries. Row actions wire up in later slices. */
export const useEventSettingsScreen = () => {
  const { t } = useTranslation("roll");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);

  const event = eventQuery.data ?? null;
  const participants = participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const isHost = role === "host";
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;

  useEffect(() => {
    if (!eventQuery.isError) return;
    Alert.alert("Error", getErrorMessage(eventQuery.error, "Failed to load event settings"));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, router]);

  useEffect(() => {
    if (isLoading || !event) return;
    if (!isHost) router.back();
  }, [isLoading, event, isHost, router]);

  // Date and film lock once the gallery is no longer upcoming (EVENT_SCHEDULE_LOCKED).
  const scheduleLocked = event ? event.galleryState !== "UPCOMING" : false;

  const subtitle = event
    ? scheduleLocked && event.galleryClosesAt
      ? t("settings.openUntil", { until: formatClosesUntil(event.galleryClosesAt) })
      : t("settings.opens", { when: formatOpensAt(event.galleryOpensAt) })
    : "";

  const whenValue = event ? formatOpensAt(event.date) : "";
  const filmValue =
    event?.galleryWindowDays != null ? t("settings.filmDays", { count: event.galleryWindowDays }) : "";

  const storage =
    event != null
      ? storagePair(Number(event.usage.storageBytes), Number(event.limits.storageBytes))
      : { used: "0", limit: "" };

  const note = event?.description?.trim() ?? "";

  // TODO: Wire each row to its editor / sheet (date, film, cover, note, envelopes, delete).
  const later = () => {};

  return {
    event,
    isLoading: isLoading || !event || !isHost,
    scheduleLocked,
    title: event?.title ?? "",
    subtitle,
    nameValue: event?.title ?? "",
    coverValue: event?.coverUrl ? t("settings.coverChange") : t("settings.coverAdd"),
    noteValue: note || t("settings.noteAdd"),
    whenValue: scheduleLocked ? t("settings.locked", { value: whenValue }) : whenValue,
    filmValue: scheduleLocked ? t("settings.locked", { value: filmValue }) : filmValue,
    storageValue: t("settings.storageUsed", { used: storage.used, limit: storage.limit }),
    envelopesValue: t("settings.envelopesTwo"),
    deleteValue: t("settings.deleteAfter"),
    onBack: () => router.back(),
    onOpenName: later,
    onOpenCover: later,
    onOpenNote: later,
    onOpenWhen: scheduleLocked ? undefined : later,
    onOpenFilm: scheduleLocked ? undefined : later,
    onOpenEnvelopes: later,
  };
};
