import { buildEvent } from "../testing/fixtures";
import { formatClosedOn, formatClosesOn, formatOpensOn, groupRolls, hasClosed, isLastDay, rollTime } from "./rolls";

const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("groupRolls", () => {
  it("splits rolls by gallery state", () => {
    const open = buildEvent({ id: "o", galleryState: "OPEN" });
    const upcoming = buildEvent({ id: "u", galleryState: "UPCOMING" });
    const closed = buildEvent({ id: "c", galleryState: "CLOSED" });

    const { live, upcoming: up, closed: done } = groupRolls([closed, open, upcoming]);

    expect(live.map((event) => event.id)).toEqual(["o"]);
    expect(up.map((event) => event.id)).toEqual(["u"]);
    expect(done.map((event) => event.id)).toEqual(["c"]);
  });

  it("orders live rolls by the one closing soonest, never-closing last", () => {
    const soon = buildEvent({ id: "soon", galleryState: "OPEN", galleryClosesAt: "2026-10-16T17:00:00.000Z" });
    const later = buildEvent({ id: "later", galleryState: "OPEN", galleryClosesAt: "2026-11-01T00:00:00.000Z" });
    const never = buildEvent({ id: "never", galleryState: "OPEN", galleryClosesAt: null });

    expect(groupRolls([never, later, soon]).live.map((event) => event.id)).toEqual(["soon", "later", "never"]);
  });

  it("orders upcoming rolls by the one opening soonest", () => {
    const first = buildEvent({ id: "first", galleryState: "UPCOMING", galleryOpensAt: "2026-10-18T21:00:00.000Z" });
    const second = buildEvent({ id: "second", galleryState: "UPCOMING", galleryOpensAt: "2026-10-25T21:00:00.000Z" });

    expect(groupRolls([second, first]).upcoming.map((event) => event.id)).toEqual(["first", "second"]);
  });

  it("orders closed rolls most recently closed first, preferring the cut date", () => {
    const old = buildEvent({ id: "old", galleryState: "CLOSED", galleryClosesAt: "2026-08-02T00:00:00.000Z" });
    const recent = buildEvent({ id: "recent", galleryState: "CLOSED", galleryClosesAt: "2026-09-21T00:00:00.000Z" });
    const cut = buildEvent({
      id: "cut",
      galleryState: "CLOSED",
      galleryClosesAt: "2026-07-01T00:00:00.000Z",
      deactivatedAt: "2026-10-01T00:00:00.000Z",
    });

    expect(groupRolls([old, recent, cut]).closed.map((event) => event.id)).toEqual(["cut", "recent", "old"]);
  });
});

describe("rollTime", () => {
  it("counts down an open roll closing within a day", () => {
    const event = buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-10-16T17:42:00.000Z" });
    expect(rollTime(event, NOW)).toEqual({ kind: "closingSoon", hours: 5, minutes: 42 });
  });

  it("shows the close date for an open roll with more than a day left", () => {
    const event = buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-11-21T00:00:00.000Z" });
    expect(rollTime(event, NOW)).toEqual({ kind: "closesOn", iso: "2026-11-21T00:00:00.000Z" });
  });

  it("marks a roll that never closes as open", () => {
    const event = buildEvent({ galleryState: "OPEN", galleryClosesAt: null });
    expect(rollTime(event, NOW)).toEqual({ kind: "open" });
  });

  it("shows when an upcoming roll opens", () => {
    const event = buildEvent({ galleryState: "UPCOMING", galleryOpensAt: "2026-10-18T21:00:00.000Z" });
    expect(rollTime(event, NOW)).toEqual({ kind: "opensOn", iso: "2026-10-18T21:00:00.000Z" });
  });

  it("uses the cut date for a closed roll when present", () => {
    const event = buildEvent({
      galleryState: "CLOSED",
      galleryClosesAt: "2026-11-01T00:00:00.000Z",
      deactivatedAt: "2026-09-21T00:00:00.000Z",
    });
    expect(rollTime(event, NOW)).toEqual({ kind: "closedOn", iso: "2026-09-21T00:00:00.000Z" });
  });

  it("reads as closed once the window has passed since the list loaded", () => {
    const event = buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-10-16T11:59:00.000Z" });
    expect(rollTime(event, NOW)).toEqual({ kind: "closedOn", iso: "2026-10-16T11:59:00.000Z" });
    expect(isLastDay(event, NOW)).toBe(false);
  });
});

describe("hasClosed", () => {
  it("is true only for an open roll whose window has run out", () => {
    const passed = "2026-10-16T11:59:00.000Z";
    expect(hasClosed(buildEvent({ galleryState: "OPEN", galleryClosesAt: passed }), NOW)).toBe(true);
    expect(hasClosed(buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-10-16T17:00:00.000Z" }), NOW)).toBe(
      false,
    );
    expect(hasClosed(buildEvent({ galleryState: "OPEN", galleryClosesAt: null }), NOW)).toBe(false);
    expect(hasClosed(buildEvent({ galleryState: "CLOSED", galleryClosesAt: passed }), NOW)).toBe(false);
  });
});

describe("isLastDay", () => {
  it("is true only while an open roll is closing within a day", () => {
    expect(isLastDay(buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-10-16T17:00:00.000Z" }), NOW)).toBe(
      true,
    );
    expect(isLastDay(buildEvent({ galleryState: "OPEN", galleryClosesAt: "2026-11-01T00:00:00.000Z" }), NOW)).toBe(
      false,
    );
    expect(isLastDay(buildEvent({ galleryState: "UPCOMING" }), NOW)).toBe(false);
  });
});

describe("date formatting", () => {
  // Build dates from local components so the wall-clock date and time are fixed
  // whatever timezone the test runs in (the app formats in the viewer's zone).
  it("formats the close date as day and short month", () => {
    expect(formatClosesOn(new Date(2026, 10, 21, 12, 0).toISOString())).toBe("21 Nov");
  });

  it("formats the open date as short weekday and 24-hour time", () => {
    expect(formatOpensOn(new Date(2026, 9, 16, 21, 0).toISOString())).toBe("Fri 21:00");
  });

  it("formats the closed date as day.month", () => {
    expect(formatClosedOn(new Date(2026, 8, 21, 12, 0).toISOString())).toBe("21.09");
  });
});
