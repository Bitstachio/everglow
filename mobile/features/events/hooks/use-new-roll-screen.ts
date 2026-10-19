import { useMyLimitsQuery } from "@/features/profile/api/queries";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Keyboard, type TextInput } from "react-native";
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
  onDay,
  rollDay,
  startOfMonth,
  TIME_SLOTS,
  WEEKDAY_INITIALS,
} from "../lib/new-roll";
import { useNewRollForm } from "./use-new-roll-form";

export type NewRollStatus = "loading" | "ready" | "notReady";

const SLOT_MINUTES = TIME_SLOTS[1] ?? 30;

/** The guest line shows while typing; the keyboard stays up when moving between the two fields. */
const useKeyboardVisible = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return visible;
};

/**
 * 04.1–04.4 A new roll: its name and a line for guests, when it happens, and
 * the film. The film on offer, its default and the latest date all come from
 * the API (`GET /users/me/limits`), never from the app.
 */
export const useNewRollScreen = () => {
  const { t } = useTranslation("create");
  const router = useRouter();
  const limitsQuery = useMyLimitsQuery();
  const newEvent = limitsQuery.data?.newEvent;
  const { form, onSubmit } = useNewRollForm({
    newEvent,
    onCreated: (event) => router.replace(`/events/${event.id}`),
  });
  const [title, description, date, galleryWindowDays] = useWatch({
    control: form.control,
    name: ["title", "description", "date", "galleryWindowDays"],
  });
  const { dirtyFields, errors, isSubmitting } = form.formState;
  const guestLineRef = useRef<TextInput>(null);
  const keyboardVisible = useKeyboardVisible();

  const now = new Date();
  const latest = new Date(newEvent?.latestDate ?? now);

  // 04.3 The slip works on a draft; Set writes it to the form.
  const [whenVisible, setWhenVisible] = useState(false);
  const [draft, setDraft] = useState(date);
  const [month, setMonth] = useState(() => startOfMonth(date));
  const clamp = (next: Date) =>
    next > latest ? atMinutes(latest, Math.floor(minutesOf(latest) / SLOT_MINUTES) * SLOT_MINUTES) : next;

  const describeWhen = (when: Date) => {
    const kind = rollDay(when, now);
    const day = kind === "date" ? formatShortDay(when) : t(`label.days.${kind}`);
    return t("label.when", { day, time: formatClock(when) });
  };

  // Names for the usual lengths; any other length is printed in days.
  const names = t("film.names", { returnObjects: true }) as Record<string, string | undefined>;
  const filmOptions = (newEvent?.galleryWindowOptions ?? []).map((days) => {
    const name = names[String(days)] ?? t("film.days", { count: days });
    return { days, name, accessibilityLabel: t("film.a11y", { name, count: days }) };
  });

  const gallery = galleryWindow(date, galleryWindowDays, now);
  const draftWindow = galleryWindow(draft, galleryWindowDays, now);
  const shownWhen = describeWhen(whenVisible ? draft : date);
  const firstMonth = startOfMonth(now);
  const lastMonth = startOfMonth(latest);

  const days = calendarMonth(month, { selected: draft, window: draftWindow, today: now, latest }).map(
    ({ key, date: day, state }) => ({
      key,
      state,
      label: day ? String(day.getDate()) : null,
      accessibilityLabel: day
        ? state === "unavailable"
          ? t("when.unavailable", { day: formatLongDay(day) })
          : formatLongDay(day)
        : undefined,
      onPress: day ? () => setDraft((current) => clamp(onDay(current, day))) : undefined,
    }),
  );

  const times = TIME_SLOTS.map((minutes) => ({
    key: `time-${minutes}`,
    label: formatMinutes(minutes),
    selected: minutesOf(draft) === minutes,
    disabled: atMinutes(draft, minutes) > latest,
    onPress: () => setDraft((current) => atMinutes(current, minutes)),
  }));

  return {
    status: (limitsQuery.isPending ? "loading" : newEvent ? "ready" : "notReady") as NewRollStatus,
    onRetry: () => void limitsQuery.refetch(),
    form,
    canLoad: title.trim().length > 0,
    isLoading: isSubmitting,
    error: errors.title?.message ?? errors.description?.message ?? errors.root?.server?.message,
    onLoad: onSubmit,
    label: {
      when: shownWhen,
      editLabel: whenVisible ? undefined : t("label.edit"),
      editA11y: t("label.editA11y", { when: shownWhen }),
    },
    guestLineRef,
    showGuestLine: keyboardVisible || description.length > 0,
    onNameSubmit: () => guestLineRef.current?.focus(),
    film: {
      options: filmOptions,
      selected: galleryWindowDays,
      circled: Boolean(dirtyFields.galleryWindowDays),
      onSelect: (days: number) => form.setValue("galleryWindowDays", days, { shouldDirty: true }),
      opens: formatShortDay(gallery.opensAt),
      closes: gallery.closesAt ? formatShortDay(gallery.closesAt) : null,
    },
    when: {
      visible: whenVisible,
      onOpen: () => {
        Keyboard.dismiss();
        setDraft(date);
        setMonth(startOfMonth(date));
        setWhenVisible(true);
      },
      onClose: () => setWhenVisible(false),
      slip: {
        month: formatMonth(month),
        previous: {
          accessibilityLabel: t("when.previousMonth"),
          disabled: month <= firstMonth,
          onPress: () => setMonth((current) => addMonths(current, -1)),
        },
        next: {
          accessibilityLabel: t("when.nextMonth"),
          disabled: month >= lastMonth,
          onPress: () => setMonth((current) => addMonths(current, 1)),
        },
        weekdays: WEEKDAY_INITIALS,
        days,
        times,
        setLabel: t("when.set", { day: formatLongDay(draft), time: formatClock(draft) }),
        onSet: () => {
          form.setValue("date", draft, { shouldDirty: true });
          setWhenVisible(false);
        },
      },
    },
    onClose: () => router.back(),
  };
};
