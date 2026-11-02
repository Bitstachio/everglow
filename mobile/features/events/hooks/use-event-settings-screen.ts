import { useAuth } from "@/context/auth-context";
import { useMyLimitsQuery } from "@/features/profile/api/queries";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useUpdateEventMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import {
  addMonths,
  atMinutes,
  calendarMonth,
  formatClock,
  formatLongDay,
  formatMinutes,
  formatMonth,
  formatShortDay,
  galleryWindow,
  minutesOf,
  monthsBetween,
  onDay,
  startOfMonth,
  TIME_SLOTS,
  WEEKDAY_INITIALS,
} from "../lib/new-roll";
import { formatClosesUntil, formatOpensAt, rollRole, storagePair } from "../lib/roll-page";

const SLOT_MINUTES = TIME_SLOTS[1] ?? 30;

/** Roll settings for upcoming and open galleries. */
export const useEventSettingsScreen = () => {
  const { t } = useTranslation(["roll", "create"]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const limitsQuery = useMyLimitsQuery();
  const updateMutation = useUpdateEventMutation(eventId ?? "");

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
      ? t("roll:settings.openUntil", { until: formatClosesUntil(event.galleryClosesAt) })
      : t("roll:settings.opens", { when: formatOpensAt(event.galleryOpensAt) })
    : "";

  const whenValue = event ? formatOpensAt(event.date) : "";
  const filmValue =
    event?.galleryWindowDays != null ? t("roll:settings.filmDays", { count: event.galleryWindowDays }) : "";

  const storage =
    event != null
      ? storagePair(Number(event.usage.storageBytes), Number(event.limits.storageBytes))
      : { used: "0", limit: "" };

  const note = event?.description?.trim() ?? "";

  const now = new Date();
  const latest = new Date(limitsQuery.data?.newEvent.latestDate ?? now);
  const eventDate = event ? new Date(event.date) : now;
  const filmDays = event?.galleryWindowDays ?? null;

  const [whenVisible, setWhenVisible] = useState(false);
  const [whenDraft, setWhenDraft] = useState(eventDate);
  const [whenMonth, setWhenMonth] = useState(() => startOfMonth(eventDate));
  const [whenError, setWhenError] = useState<string | null>(null);
  const [whenSaving, setWhenSaving] = useState(false);

  const clampWhen = (next: Date) =>
    next > latest ? atMinutes(latest, Math.floor(minutesOf(latest) / SLOT_MINUTES) * SLOT_MINUTES) : next;

  const openWhen = () => {
    if (!event || scheduleLocked) return;
    const date = new Date(event.date);
    setWhenDraft(date);
    setWhenMonth(startOfMonth(date));
    setWhenError(null);
    setWhenVisible(true);
  };

  const draftWindow = galleryWindow(whenDraft, filmDays, now);
  const firstMonth = startOfMonth(now);
  const lastMonth = startOfMonth(latest);
  const monthCount = Math.max(1, monthsBetween(firstMonth, lastMonth) + 1);
  const whenMonths = Array.from({ length: monthCount }, (_, i) => {
    const shown = addMonths(firstMonth, i);
    const days = calendarMonth(shown, {
      selected: whenDraft,
      window: draftWindow,
      today: now,
      latest,
    }).map(({ key, date: day, state }) => ({
      key,
      state,
      label: day ? String(day.getDate()) : null,
      accessibilityLabel: day
        ? state === "unavailable"
          ? t("roll:settings.editWhen.unavailable", { day: formatLongDay(day) })
          : formatLongDay(day)
        : undefined,
      onPress: day ? () => setWhenDraft((current) => clampWhen(onDay(current, day))) : undefined,
    }));
    return { key: `month-${i}`, title: formatMonth(shown), days };
  });
  const whenMonthIndex = Math.min(Math.max(monthsBetween(firstMonth, whenMonth), 0), monthCount - 1);
  const whenTimes = TIME_SLOTS.map((minutes) => ({
    key: `time-${minutes}`,
    label: formatMinutes(minutes),
    selected: minutesOf(whenDraft) === minutes,
    disabled: atMinutes(whenDraft, minutes) > latest,
    onPress: () => setWhenDraft((current) => atMinutes(current, minutes)),
  }));

  const saveWhen = async () => {
    if (!eventId || whenSaving) return;
    if (whenDraft.getTime() === eventDate.getTime()) {
      setWhenVisible(false);
      return;
    }
    setWhenSaving(true);
    setWhenError(null);
    try {
      await updateMutation.mutateAsync({ date: whenDraft.toISOString() });
      setWhenVisible(false);
    } catch (error) {
      setWhenError(getErrorMessage(error, t("roll:settings.editWhen.failed")));
    } finally {
      setWhenSaving(false);
    }
  };

  const [filmVisible, setFilmVisible] = useState(false);
  const [filmDraft, setFilmDraft] = useState<number | null>(filmDays);
  const [filmError, setFilmError] = useState<string | null>(null);
  const [filmSaving, setFilmSaving] = useState(false);

  const openFilm = () => {
    if (!event || scheduleLocked) return;
    setFilmDraft(event.galleryWindowDays);
    setFilmError(null);
    setFilmVisible(true);
  };

  const filmNames = t("create:film.names", { returnObjects: true }) as Record<string, string | undefined>;
  const filmOptions = (event?.galleryWindowOptions ?? []).map((days) => {
    const name = filmNames[String(days)] ?? t("create:film.days", { count: days });
    return { days, name, accessibilityLabel: t("create:film.a11y", { name, count: days }) };
  });
  const filmPreview = galleryWindow(eventDate, filmDraft, now);

  const saveFilm = async () => {
    if (!eventId || filmSaving || filmDraft == null) return;
    if (filmDraft === filmDays) {
      setFilmVisible(false);
      return;
    }
    setFilmSaving(true);
    setFilmError(null);
    try {
      await updateMutation.mutateAsync({ galleryWindowDays: filmDraft });
      setFilmVisible(false);
    } catch (error) {
      setFilmError(getErrorMessage(error, t("roll:settings.editFilm.failed")));
    } finally {
      setFilmSaving(false);
    }
  };

  // TODO: Wire cover, envelopes, and delete.
  const later = () => {};

  return {
    event,
    isLoading: isLoading || !event || !isHost,
    scheduleLocked,
    title: event?.title ?? "",
    subtitle,
    nameValue: event?.title ?? "",
    coverValue: event?.coverUrl ? t("roll:settings.coverChange") : t("roll:settings.coverAdd"),
    noteValue: note || t("roll:settings.noteAdd"),
    whenValue: scheduleLocked ? t("roll:settings.locked", { value: whenValue }) : whenValue,
    filmValue: scheduleLocked ? t("roll:settings.locked", { value: filmValue }) : filmValue,
    storageValue: t("roll:settings.storageUsed", { used: storage.used, limit: storage.limit }),
    envelopesValue: t("roll:settings.envelopesTwo"),
    deleteValue: t("roll:settings.deleteAfter"),
    onBack: () => router.back(),
    onOpenName: () => {
      if (eventId) router.push(`/events/${eventId}/edit-title`);
    },
    onOpenCover: later,
    onOpenNote: () => {
      if (eventId) router.push(`/events/${eventId}/edit-description`);
    },
    onOpenWhen: scheduleLocked ? undefined : openWhen,
    onOpenFilm: scheduleLocked ? undefined : openFilm,
    onOpenEnvelopes: later,
    when: {
      visible: whenVisible,
      onClose: () => {
        if (whenSaving) return;
        setWhenVisible(false);
      },
      edge: t("roll:settings.editWhen.edge"),
      months: whenMonths,
      monthIndex: whenMonthIndex,
      onMonthChange: (index: number) => setWhenMonth(addMonths(firstMonth, index)),
      previous: {
        accessibilityLabel: t("roll:settings.editWhen.previousMonth"),
        disabled: whenMonth.getTime() <= firstMonth.getTime(),
      },
      next: {
        accessibilityLabel: t("roll:settings.editWhen.nextMonth"),
        disabled: whenMonth.getTime() >= lastMonth.getTime(),
      },
      weekdays: WEEKDAY_INITIALS,
      times: whenTimes,
      people: t("roll:settings.editWhen.people", { count: participants.length }),
      error: whenError,
      setLabel: t("roll:settings.editWhen.move", {
        day: formatLongDay(whenDraft),
        time: formatClock(whenDraft),
      }),
      onSet: () => void saveWhen(),
      isSetting: whenSaving,
    },
    film: {
      visible: filmVisible,
      onClose: () => {
        if (filmSaving) return;
        setFilmVisible(false);
      },
      heading: t("roll:settings.editFilm.heading"),
      unit: t("roll:settings.editFilm.dayRoll"),
      options: filmOptions,
      selected: filmDraft,
      onSelect: setFilmDraft,
      circled: filmDraft !== null && filmDraft !== filmDays,
      closes: filmPreview.closesAt ? formatShortDay(filmPreview.closesAt) : null,
      error: filmError,
      saveLabel: t("roll:settings.editFilm.save"),
      onSave: () => void saveFilm(),
      isSaving: filmSaving,
      canSave: filmDraft != null,
    },
  };
};
