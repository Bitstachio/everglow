import { useAuth } from "@/context/auth-context";
import { useMyLimitsQuery } from "@/features/profile/api/queries";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate, formatDateTime, formatMinutes, formatMonth, formatTime } from "@/lib/format-date";
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
  galleryWindow,
  minutesOf,
  monthsBetween,
  onDay,
  startOfMonth,
  TIME_SLOTS,
  WEEKDAY_INITIALS,
} from "../lib/new-roll";
import { closedOn, envelopeCount, envelopeState } from "../lib/envelope";
import { rollRole, storagePair } from "../lib/roll-page";
import { useChangeEventCover } from "./use-change-event-cover";
import { useDeleteRoll } from "./use-delete-roll";

const SLOT_MINUTES = TIME_SLOTS[1] ?? 30;

// A roll has at most two envelopes: participant and viewer.
const ENVELOPE_COUNT_KEYS = [
  "event:settings.envelopeCount.0",
  "event:settings.envelopeCount.1",
  "event:settings.envelopeCount.2",
] as const;

/** Roll settings for upcoming and open galleries. */
export const useEventSettingsScreen = () => {
  const { t } = useTranslation(["event", "create"]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const limitsQuery = useMyLimitsQuery();
  const updateMutation = useUpdateEventMutation(eventId ?? "");

  const event = eventQuery.data ?? null;
  // A roll can be deleted once it has closed (EVENT_STILL_ACTIVE before then).
  // Before that, Delete the roll explains why instead of calling the API.
  const [deleteVisible, setDeleteVisible] = useState(false);
  const deleteRoll = useDeleteRoll(event, { onDeleted: () => setDeleteVisible(false) });
  const isRollDeleted = deleteRoll.isDeleted;
  const cover = useChangeEventCover(eventId ?? "", Boolean(event?.coverUrl));
  const participants = participantsQuery.data ?? [];
  const role = event ? rollRole(event, participants, user?.id) : "viewer";
  const isOrganizer = role === "organizer";
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;

  useEffect(() => {
    if (!eventQuery.isError || isRollDeleted()) return;
    Alert.alert(t("event:settings.loadFailed"), getErrorMessage(eventQuery.error));
    router.back();
  }, [eventQuery.isError, eventQuery.errorUpdatedAt, eventQuery.error, isRollDeleted, router, t]);

  useEffect(() => {
    if (isLoading || !event) return;
    if (!isOrganizer) router.back();
  }, [isLoading, event, isOrganizer, router]);

  // Date and film lock once the gallery is no longer upcoming (EVENT_SCHEDULE_LOCKED).
  const scheduleLocked = event ? event.galleryState !== "UPCOMING" : false;

  const isClosed = event?.galleryState === "CLOSED";
  const subtitle = !event
    ? ""
    : isClosed
      ? t("event:closed.top", { date: formatDate(closedOn(event)) })
      : event.galleryState === "OPEN"
        ? event.galleryClosesAt
          ? t("event:settings.openUntil", { until: formatDate(event.galleryClosesAt) })
          : t("event:settings.open")
        : t("event:settings.opens", { when: formatDateTime(event.galleryOpensAt) });

  const whenValue = event ? formatDateTime(event.date) : "";
  const filmValue =
    event?.galleryWindowDays != null ? t("event:settings.durationDays", { count: event.galleryWindowDays }) : "";

  const storage =
    event != null
      ? storagePair(Number(event.usage.storageBytes), Number(event.limits.storageBytes))
      : { used: "0", limit: "" };

  const note = event?.description?.trim() ?? "";

  // The envelopes as the API lists them: how many, and whether they can be
  // reset now. A closed roll lists none, since nobody can join it.
  const envelopesValue = (() => {
    if (!event) return "";
    const state = envelopeState(event);
    if (state === "closed") return t("event:settings.envelopesClosed");
    if (state === "suspended") return t("event:settings.envelopesSuspended");
    const held = envelopeCount(event);
    const count = t(ENVELOPE_COUNT_KEYS[Math.min(held, ENVELOPE_COUNT_KEYS.length - 1)]);
    // No envelope, nothing to reset.
    if (held === 0) return count;
    return state === "onHold"
      ? t("event:settings.envelopesOnHold", { count })
      : t("event:settings.envelopesReset", { count });
  })();

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
  // Everyone else on the roll: the organizer moving it knows already.
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
          ? t("event:settings.editWhen.unavailable", { day: formatDate(day) })
          : formatDate(day)
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
      setWhenError(getErrorMessage(error, t("event:settings.editWhen.failed")));
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

  const filmNames = t("create:duration.names", { returnObjects: true }) as Record<string, string | undefined>;
  const filmOptions = (event?.galleryWindowOptions ?? []).map((days) => {
    const name = filmNames[String(days)] ?? t("create:duration.days", { count: days });
    return { days, name, accessibilityLabel: t("create:duration.a11y", { name, count: days }) };
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
      setFilmError(getErrorMessage(error, t("event:settings.editDuration.failed")));
      // The roll may have opened meanwhile (EVENT_SCHEDULE_LOCKED): show the index as it is now.
      void eventQuery.refetch();
    } finally {
      setFilmSaving(false);
    }
  };

  return {
    event,
    isLoading: isLoading || !event || !isOrganizer,
    scheduleLocked,
    title: event?.title ?? "",
    subtitle,
    nameValue: event?.title ?? "",
    coverValue: event?.coverUrl ? t("event:settings.coverChange") : t("event:settings.coverAdd"),
    noteValue: note || t("event:settings.noteAdd"),
    whenValue: scheduleLocked ? t("event:settings.locked", { value: whenValue }) : whenValue,
    filmValue: scheduleLocked ? t("event:settings.locked", { value: filmValue }) : filmValue,
    storageValue: t("event:settings.storageUsed", { used: storage.used, limit: storage.limit }),
    envelopesValue,
    deleteValue: isClosed ? undefined : t("event:settings.deleteAfter"),
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
      deleteRoll.reset();
      setDeleteVisible(true);
    },
    deleteRoll: {
      ...deleteRoll.slip,
      visible: deleteVisible,
      // Home once the slip has gone.
      onClosed: deleteRoll.leaveIfDeleted,
      onClose: () => {
        if (deleteRoll.isDeleting) return;
        setDeleteVisible(false);
      },
    },
    when: {
      visible: whenVisible,
      onClose: () => {
        if (whenSaving) return;
        setWhenVisible(false);
      },
      edge: t("event:settings.editWhen.edge"),
      months: whenMonths,
      monthIndex: whenMonthIndex,
      onMonthChange: (index: number) => setWhenMonth(addMonths(firstMonth, index)),
      previous: {
        accessibilityLabel: t("event:settings.editWhen.previousMonth"),
        disabled: whenMonth.getTime() <= firstMonth.getTime(),
      },
      next: {
        accessibilityLabel: t("event:settings.editWhen.nextMonth"),
        disabled: whenMonth.getTime() >= lastMonth.getTime(),
      },
      weekdays: WEEKDAY_INITIALS,
      times: whenTimes,
      people: othersOnRoll > 0 ? t("event:settings.editWhen.people", { count: othersOnRoll }) : null,
      error: whenError,
      setLabel: t("event:settings.editWhen.move", {
        day: formatDate(whenDraft),
        time: formatTime(whenDraft),
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
      heading: t("event:settings.editDuration.heading"),
      unit: t("event:settings.editDuration.unit"),
      options: filmOptions,
      selected: filmDraft,
      onSelect: setFilmDraft,
      closes: filmPreview.closesAt ? formatDate(filmPreview.closesAt) : null,
      error: filmError,
      saveLabel: t("event:settings.editDuration.save"),
      onSave: () => void saveFilm(),
      isSaving: filmSaving,
      canSave: filmDraft != null,
    },
  };
};
