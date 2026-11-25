import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMinutes,
  formatMonth,
  formatMonthYear,
  formatTime,
} from "./format-date";

const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);
const now = at(2026, 11, 25, 12);

test("prints a weekday, day and month, and the year only outside the current year", () => {
  expect(formatDate(at(2026, 11, 20), now)).toBe("Fri, 20 Nov");
  expect(formatDate(at(2026, 11, 20).toISOString(), now)).toBe("Fri, 20 Nov");
  expect(formatDate(at(2024, 11, 20), now)).toBe("Wed, 20 Nov 2024");
  expect(formatDate(at(2027, 1, 4), now)).toBe("Mon, 4 Jan 2027");
});

test("prints the same date with a 24-hour time", () => {
  expect(formatDateTime(at(2026, 11, 7, 19), now)).toBe("Sat, 7 Nov, 19:00");
  expect(formatDateTime(at(2026, 11, 7, 19, 30), now)).toBe("Sat, 7 Nov, 19:30");
  expect(formatDateTime(at(2025, 11, 8, 0, 5), now)).toBe("Sat, 8 Nov 2025, 00:05");
});

test("prints a clock on its own, with midnight as 00", () => {
  expect(formatTime(at(2026, 11, 7, 19, 5))).toBe("19:05");
  expect(formatTime(at(2026, 10, 31, 0, 5))).toBe("00:05");
  expect(formatMinutes(9 * 60 + 30)).toBe("09:30");
  expect(formatMinutes(0)).toBe("00:00");
});

test("prints a range, and adds years when the ends are not both in the current year", () => {
  expect(formatDateRange(at(2026, 9, 12), at(2026, 9, 21), now)).toBe("Sat, 12 Sep – Mon, 21 Sep");
  expect(formatDateRange(at(2026, 10, 18), at(2027, 1, 4), now)).toBe("Sun, 18 Oct 2026 – Mon, 4 Jan 2027");
  expect(formatDateRange(at(2024, 9, 12), at(2024, 9, 21), now)).toBe("Thu, 12 Sep 2024 – Sat, 21 Sep 2024");
});

test("prints a calendar month, and a short month that always keeps its year", () => {
  expect(formatMonth(at(2026, 11, 7))).toBe("November 2026");
  expect(formatMonthYear(at(2026, 10, 15))).toBe("Oct 2026");
});
