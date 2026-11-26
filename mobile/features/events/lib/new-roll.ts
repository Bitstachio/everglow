/**
 * Dates on a new roll (04.1–04.4): its default time, the days its gallery is
 * open, and the calendar and times in the "When it happens" slip. Plain
 * functions so the screen hook stays small and these stay testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Tonight · 20:00" until it has passed. */
const EVENING_HOUR = 20;

/** From this hour, a time today reads "Tonight". */
const TONIGHT_FROM_HOUR = 17;

/** The times in the slip, in minutes after midnight, half an hour apart. */
export const TIME_SLOTS: readonly number[] = Array.from({ length: 48 }, (_, i) => i * 30);

/** A new roll starts tonight at 20:00, or on the hour already under way once 20:00 has passed. */
export const defaultRollDate = (now: Date = new Date()): Date => {
  const evening = new Date(now);
  evening.setHours(EVENING_HOUR, 0, 0, 0);
  if (evening > now) return evening;
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  return hour;
};

export const startOfDay = (date: Date): Date => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (month: Date, count: number): Date =>
  new Date(month.getFullYear(), month.getMonth() + count, 1);

/** Whole months from one month to another: 0 for the same month, 1 for the next. */
export const monthsBetween = (from: Date, to: Date): number =>
  (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The same time of day on another day. */
export const onDay = (date: Date, day: Date): Date => {
  const next = new Date(date);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
};

/** The same day at `minutes` after midnight. */
export const atMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

export const minutesOf = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/**
 * When the gallery opens and closes, as the API works it out
 * (`docs/event-quotas.md`): on the roll's date, or as soon as it is created if
 * that has passed, for the length picked. Null `days` never closes.
 */
export const galleryWindow = (date: Date, days: number | null, now: Date = new Date()) => {
  const opensAt = new Date(Math.max(date.getTime(), now.getTime()));
  const closesAt = days === null ? null : new Date(opensAt.getTime() + days * DAY_MS);
  return { opensAt, closesAt };
};

/** How the label names the day: "Tonight", "Today", "Tomorrow", or the date. */
export type RollDay = "tonight" | "today" | "tomorrow" | "date";

export const rollDay = (date: Date, now: Date = new Date()): RollDay => {
  if (isSameDay(date, now)) return date.getHours() >= TONIGHT_FROM_HOUR ? "tonight" : "today";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return isSameDay(date, tomorrow) ? "tomorrow" : "date";
};

export type CalendarDayState = "open" | "selected" | "window" | "unavailable";

export type CalendarDay = { key: string; date: Date | null; state: CalendarDayState };

type CalendarOptions = {
  selected: Date;
  /** The days after the opening day and before the closing one are marked as the window. */
  window: { opensAt: Date; closesAt: Date | null };
  /** Days before today can't be picked. */
  today: Date;
  /** The API's `newEvent.latestDate`; days after it can't be picked. */
  latest: Date;
};

/** A month in weeks from Sunday, blank cells before the 1st. */
export const calendarMonth = (month: Date, { selected, window, today, latest }: CalendarOptions): CalendarDay[] => {
  const first = startOfMonth(month);
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const blanks = Array.from(
    { length: first.getDay() },
    (_, i): CalendarDay => ({
      key: `blank-${i}`,
      date: null,
      state: "unavailable",
    }),
  );
  const opensOn = startOfDay(window.opensAt).getTime();
  const closesOn = window.closesAt ? startOfDay(window.closesAt).getTime() : -Infinity;
  const firstDay = startOfDay(today).getTime();
  const lastDay = startOfDay(latest).getTime();

  const days = Array.from({ length }, (_, i): CalendarDay => {
    const date = new Date(first.getFullYear(), first.getMonth(), i + 1);
    const time = date.getTime();
    const state: CalendarDayState = isSameDay(date, selected)
      ? "selected"
      : time < firstDay || time > lastDay
        ? "unavailable"
        : time > opensOn && time < closesOn
          ? "window"
          : "open";
    return { key: `day-${i + 1}`, date, state };
  });
  return [...blanks, ...days];
};

/** "S M T W T F S", from Sunday. */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
