import { useAuth } from "@/context/auth-context";
import { useMyLimitsQuery } from "@/features/profile/api/queries";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useDeleteEventMutation, useUpdateEventMutation } from "../api/mutations";
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
import { closedOn, formatEnvelopeDay } from "../lib/envelope";
import { formatOpensAt, rollRole, storagePair } from "../lib/roll-page";
import { formatClosedOn } from "../lib/rolls";
import { useChangeEventCover } from "./use-change-event-cover";

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
  const deleteMutation = useDeleteEventMutation();
  // Once the roll is deleted its queries fail on the way out; that's not a load error.
  const deleted = useRef(false);

  const event = eventQuery.data ?? null;
  const cover = useChangeEventCover(eventId ?? "", Boolean(event?.coverUrl));
  const participants = participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const isHost = role === "host";
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;

  useEffect(() => {
    if (!eventQuery.isError || deleted.current) return;
    Alert.alert(t("roll:settings.loadFailed"), getErrorMessage(eventQuery.error));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, router, t]);

  useEffect(() => {
    if (isLoading || !event) return;
    if (!isHost) router.back();
  }, [isLoading, event, isHost, router]);

  // Date and film lock once the gallery is no longer upcoming (EVENT_SCHEDULE_LOCKED).
  const scheduleLocked = event ? event.galleryState !== "UPCOMING" : false;

  const isClosed = event?.galleryState === "CLOSED";
  const subtitle = !event
    ? ""
    : isClosed
      ? t("roll:closed.top", { date: formatClosedOn(closedOn(event)) })
      : event.galleryState === "OPEN"
        ? event.galleryClosesAt
          ? t("roll:settings.openUntil", { until: formatEnvelopeDay(event.galleryClosesAt) })
          : t("roll:settings.open")
        : t("roll:settings.opens", { when: formatOpensAt(event.galleryOpensAt) });

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

  // The latest date comes with the account's limits; until then the calendar would end today.
  const canOpenWhen = !scheduleLocked && Boolean(limitsQuery.data);
  // Everyone else on the roll: the host moving it knows already.
  const othersOnRoll = participants.filter((participant) => participant.userId !== user?.id).length;

  const openWhen = () => {
    if (!event || !canOpenWhen) return;
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
      // The roll may have opened meanwhile (EVENT_SCHEDULE_LOCKED): show the index as it is now.
      void eventQuery.refetch();
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
      // The roll may have opened meanwhile (EVENT_SCHEDULE_LOCKED): show the index as it is now.
      void eventQuery.refetch();
    } finally {
      setFilmSaving(false);
    }
  };

  // A roll can be deleted once it has closed (EVENT_STILL_ACTIVE before then).
  // Before that, Delete the roll explains why instead of calling the API.
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = () => {
    if (!eventId || deleteMutation.isPending) return;
    setDeleteError(null);
    deleted.current = true;
    deleteMutation.mutate(eventId, {
      // Home once the slip has gone (see onClosed below).
      onSuccess: () => setDeleteVisible(false),
      onError: (error) => {
        deleted.current = false;
        setDeleteError(getErrorMessage(error, t("roll:settings.deleteRoll.failed")));
      },
    });
  };

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
    deleteValue: isClosed ? undefined : t("roll:settings.deleteAfter"),
    onBack: () => router.back(),
    onOpenName: () => {
      if (eventId) router.push(`/events/${eventId}/edit-title`);
    },
    onOpenCover: cover.handleChangeCover,
    isUpdatingCover: cover.isUpdatingCover,
    coverCrop: cover.coverCrop,
    onOpenNote: () => {
      if (eventId) router.push(`/events/${eventId}/edit-description`);
    },
    onOpenWhen: canOpenWhen ? openWhen : undefined,
    onOpenFilm: scheduleLocked ? undefined : openFilm,
    onOpenEnvelopes: () => {
      if (eventId) router.push(`/events/${eventId}/envelope`);
    },
    // Closed, the delete slip; before then, why it can't go yet (EVENT_STILL_ACTIVE).
    onOpenDelete: () => {
      if (!isClosed) {
        if (eventId) router.push(`/events/${eventId}/cant-delete`);
        return;
      }
      setDeleteError(null);
      setDeleteVisible(true);
    },
    deleteRoll: {
      visible: deleteVisible,
      onClosed: () => {
        if (!deleted.current) return;
        // Home, past the roll underneath, which would only fail to load now.
        router.dismissAll();
        router.replace("/events");
      },
      onClose: () => {
        if (deleteMutation.isPending) return;
        setDeleteVisible(false);
      },
      edge: event
        ? t("roll:settings.deleteRoll.edge", {
            date: formatClosedOn(closedOn(event)),
            count: event.usage.members,
          })
        : "",
      body: t("roll:settings.deleteRoll.body", { count: event?.usage.members ?? 0 }),
      confirmLabel: t("roll:settings.deleteRoll.confirm", { title: event?.title ?? "" }),
      onConfirm: confirmDelete,
      isDeleting: deleteMutation.isPending,
      error: deleteError,
    },
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
      people: othersOnRoll > 0 ? t("roll:settings.editWhen.people", { count: othersOnRoll }) : null,
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
