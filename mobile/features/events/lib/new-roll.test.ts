import {
  addMonths,
  atMinutes,
  calendarMonth,
  defaultRollDate,
  formatClock,
  formatEnvelopeDate,
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
} from "./new-roll";

// Local times throughout: the app shows the device's own clock.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test("a new roll starts tonight at 20:00, or on the hour once 20:00 has passed", () => {
  expect(defaultRollDate(at(2026, 11, 7, 9, 41))).toEqual(at(2026, 11, 7, 20));
  expect(defaultRollDate(at(2026, 11, 7, 20))).toEqual(at(2026, 11, 7, 20));
  expect(defaultRollDate(at(2026, 11, 7, 22, 35))).toEqual(at(2026, 11, 7, 22));
});

test("the gallery opens on the date, or now if that has passed, for the days picked", () => {
  const now = at(2026, 11, 1, 12);
  expect(galleryWindow(at(2026, 11, 7, 19), 7, now)).toEqual({
    opensAt: at(2026, 11, 7, 19),
    closesAt: new Date(at(2026, 11, 7, 19).getTime() + 7 * 24 * 60 * 60 * 1000),
  });
  expect(galleryWindow(at(2026, 10, 20, 19), 3, now).opensAt).toEqual(now);
  expect(galleryWindow(at(2026, 11, 7, 19), null, now).closesAt).toBeNull();
});

test("names the day the way the label says it", () => {
  const now = at(2026, 11, 7, 9);
  expect(rollDay(at(2026, 11, 7, 20), now)).toBe("tonight");
  expect(rollDay(at(2026, 11, 7, 12), now)).toBe("today");
  expect(rollDay(at(2026, 11, 8, 20), now)).toBe("tomorrow");
  expect(rollDay(at(2026, 11, 9, 20), now)).toBe("date");
});

test("lays a month out from Sunday, shading the days the roll is open", () => {
  // 1 November 2026 is a Sunday.
  const days = calendarMonth(at(2026, 11, 1), {
    selected: at(2026, 11, 7, 19),
    window: { opensAt: at(2026, 11, 7, 19), closesAt: at(2026, 11, 14, 19) },
    today: at(2026, 11, 3, 10),
    latest: at(2026, 11, 28, 10),
  });
  const state = (day: number) => days.find((cell) => cell.date?.getDate() === day)?.state;

  expect(days).toHaveLength(30);
  expect(state(2)).toBe("unavailable");
  expect(state(3)).toBe("open");
  expect(state(7)).toBe("selected");
  expect([8, 9, 10, 11, 12, 13].map(state)).toEqual(Array(6).fill("window"));
  expect(state(14)).toBe("open");
  expect(state(28)).toBe("open");
  expect(state(29)).toBe("unavailable");

  const december = calendarMonth(at(2026, 12, 1), {
    selected: at(2026, 12, 25),
    window: { opensAt: at(2026, 12, 25), closesAt: null },
    today: at(2026, 12, 1),
    latest: at(2027, 12, 1),
  });
  // 1 December 2026 is a Tuesday: two blank cells first.
  expect(december.slice(0, 2).map((cell) => cell.date)).toEqual([null, null]);
  expect(december.filter((cell) => cell.state === "window")).toHaveLength(0);
});

test("moves a date to another day or time and back", () => {
  const date = at(2026, 11, 7, 19, 30);
  expect(onDay(date, at(2026, 12, 24))).toEqual(at(2026, 12, 24, 19, 30));
  expect(atMinutes(date, 21 * 60)).toEqual(at(2026, 11, 7, 21));
  expect(minutesOf(date)).toBe(19 * 60 + 30);
  expect(startOfMonth(date)).toEqual(at(2026, 11, 1));
  expect(addMonths(at(2026, 12, 1), 1)).toEqual(at(2027, 1, 1));
  expect(TIME_SLOTS).toHaveLength(48);
  expect(TIME_SLOTS[39]).toBe(19 * 60 + 30);
});

test("formats the day, time and month as the drawings print them", () => {
  const date = at(2026, 11, 7, 19);
  expect(formatShortDay(date)).toBe("Sat 07.11");
  expect(formatLongDay(date)).toBe("Sat 7 Nov");
  expect(formatClock(date)).toBe("19:00");
  expect(formatMinutes(9 * 60 + 30)).toBe("09:30");
  expect(formatMonth(date)).toBe("November 2026");
  expect(WEEKDAY_INITIALS).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  expect(formatEnvelopeDate(date)).toBe("Sat 7 Nov, 7 pm");
  expect(formatEnvelopeDate(at(2026, 11, 8, 0, 30))).toBe("Sun 8 Nov, 12:30 am");
});
