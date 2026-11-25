/**
 * The product date style: English, day before month, a short month name, and a
 * 24-hour clock. The year is printed only when it is not the current calendar
 * year, so a date reads "Fri, 20 Nov" this year and "Fri, 20 Nov 2024" otherwise.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type DateInput = Date | string | number;

const toDate = (value: DateInput): Date => (value instanceof Date ? value : new Date(value));

const pad = (value: number): string => String(value).padStart(2, "0");

const otherYear = (date: Date, now: Date): boolean => date.getFullYear() !== now.getFullYear();

const printDate = (date: Date, withYear: boolean): string => {
  const year = withYear ? ` ${date.getFullYear()}` : "";
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
};

/** "Fri, 20 Nov", or "Fri, 20 Nov 2024" when `date` is not in `now`'s year. */
export const formatDate = (value: DateInput, now: Date = new Date()): string => {
  const date = toDate(value);
  return printDate(date, otherYear(date, now));
};

/** "19:00". Midnight is "00:05", never "24:05". */
export const formatTime = (value: DateInput): string => {
  const date = toDate(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** "19:00" for a time of day counted in minutes after midnight. */
export const formatMinutes = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** "Fri, 20 Nov, 19:00", with the year when it is not the current one. */
export const formatDateTime = (value: DateInput, now: Date = new Date()): string =>
  `${formatDate(value, now)}, ${formatTime(value)}`;

/**
 * "Sat, 12 Sep – Mon, 21 Sep". Both ends carry a year when they fall in
 * different years, or when neither is the current year.
 */
export const formatDateRange = (from: DateInput, to: DateInput, now: Date = new Date()): string => {
  const start = toDate(from);
  const end = toDate(to);
  const withYear = start.getFullYear() !== end.getFullYear() || otherYear(start, now) || otherYear(end, now);
  return `${printDate(start, withYear)} – ${printDate(end, withYear)}`;
};

/** "November 2026". A calendar heading always names its year. */
export const formatMonth = (value: DateInput): string => {
  const date = toDate(value);
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
};

/** "Oct 2026". A "since" line always names its year. */
export const formatMonthYear = (value: DateInput): string => {
  const date = toDate(value);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};
