import { buildEvent, buildParticipant, buildPhoto } from "../testing/fixtures";
import {
  bandStock,
  bandTime,
  durationUntil,
  hostName,
  isRollLastDay,
  rollRole,
  rollStage,
  sheetFrames,
  shouldShowOpened,
  storagePair,
} from "./roll-page";

const NOW = new Date("2026-10-10T12:00:00.000Z");

describe("rollRole", () => {
  it("reads the caller's access level from the roll call", () => {
    const participants = [
      buildParticipant({ userId: "host", accessLevel: "ORGANIZER" }),
      buildParticipant({ userId: "guest", accessLevel: "PARTICIPANT" }),
      buildParticipant({ userId: "viewer", accessLevel: "VIEWER" }),
    ];
    const event = buildEvent({ creatorId: "someone-else" });
    expect(rollRole(event, participants, "host")).toBe("host");
    expect(rollRole(event, participants, "guest")).toBe("guest");
    expect(rollRole(event, participants, "viewer")).toBe("viewer");
  });

  it("treats the creator as host until the roll call loads", () => {
    expect(rollRole(buildEvent({ creatorId: "user-1" }), [], "user-1")).toBe("host");
  });

  it("goes by the roll call over the creator: a creator demoted to guest is a guest", () => {
    const participants = [buildParticipant({ userId: "user-1", accessLevel: "PARTICIPANT" })];
    expect(rollRole(buildEvent({ creatorId: "user-1" }), participants, "user-1")).toBe("guest");
  });
});

describe("rollStage", () => {
  it.each([
    [{ status: "ACTIVE", galleryState: "UPCOMING" }, 0, "upcoming"],
    [{ status: "ACTIVE", galleryState: "OPEN" }, 0, "empty"],
    [{ status: "ACTIVE", galleryState: "OPEN" }, 3, "open"],
    [{ status: "ACTIVE", galleryState: "CLOSED" }, 0, "closed"],
    [{ status: "UNDER_REVIEW", galleryState: "OPEN" }, 3, "underReview"],
    [{ status: "UNDER_REVIEW", galleryState: "CLOSED" }, 0, "closed"],
    [{ status: "SUSPENDED", galleryState: "OPEN" }, 0, "suspended"],
    [{ status: "SUSPENDED", galleryState: "CLOSED" }, 0, "suspended"],
  ] as const)("%o with %i frames is %s", (event, frames, stage) => {
    expect(rollStage(event, frames)).toBe(stage);
  });
});

describe("durationUntil", () => {
  it("counts whole days, rounding up, past a day", () => {
    expect(durationUntil("2026-10-14T13:00:00.000Z", NOW)).toEqual({ kind: "days", days: 5 });
  });

  it("counts hours and minutes inside the last day", () => {
    expect(durationUntil("2026-10-10T17:42:30.000Z", NOW)).toEqual({ kind: "hoursMinutes", hours: 5, minutes: 42 });
  });

  it("never goes below zero", () => {
    expect(durationUntil("2026-10-09T12:00:00.000Z", NOW)).toEqual({ kind: "hoursMinutes", hours: 0, minutes: 0 });
  });
});

describe("bandTime and isRollLastDay", () => {
  it("says when an upcoming roll opens", () => {
    const event = buildEvent({ galleryState: "UPCOMING", galleryOpensAt: "2026-10-14T12:00:00.000Z" });
    expect(bandTime(event, NOW)).toEqual({ kind: "opensIn", duration: { kind: "days", days: 4 } });
  });

  it("says how long an open roll has left, and circles its last day", () => {
    const event = buildEvent({ galleryClosesAt: "2026-10-10T17:42:00.000Z" });
    expect(bandTime(event, NOW)).toEqual({ kind: "left", duration: { kind: "hoursMinutes", hours: 5, minutes: 42 } });
    expect(isRollLastDay(event, NOW)).toBe(true);
    expect(isRollLastDay(buildEvent({ galleryClosesAt: "2026-10-12T12:00:00.000Z" }), NOW)).toBe(false);
  });

  it("puts the hold before the time", () => {
    expect(bandTime(buildEvent({ status: "UNDER_REVIEW" }), NOW)).toEqual({ kind: "onHold" });
    expect(bandTime(buildEvent({ status: "SUSPENDED" }), NOW)).toEqual({ kind: "suspended" });
    expect(
      isRollLastDay(buildEvent({ status: "UNDER_REVIEW", galleryClosesAt: "2026-10-10T13:00:00.000Z" }), NOW),
    ).toBe(false);
  });

  it("shows no countdown on a roll that never closes", () => {
    expect(bandTime(buildEvent({ galleryClosesAt: null }), NOW)).toEqual({ kind: "open" });
  });
});

describe("bandStock", () => {
  it("shows room to those who add photos and frames to those who only look", () => {
    expect(bandStock("open", "host")).toEqual({ kind: "storage" });
    expect(bandStock("open", "guest")).toEqual({ kind: "storage" });
    expect(bandStock("upcoming", "guest")).toEqual({ kind: "frames" });
    expect(bandStock("open", "viewer")).toEqual({ kind: "frames" });
    expect(bandStock("suspended", "host")).toEqual({ kind: "hidden" });
  });
});

describe("storagePair", () => {
  const GB = 1024 ** 3;

  it("drops the shared unit from the used side", () => {
    expect(storagePair(1.2 * GB, 3 * GB)).toEqual({ used: "1.2", limit: "3 GB" });
  });

  it("prints an empty roll as a bare 0", () => {
    expect(storagePair(0, 3 * GB)).toEqual({ used: "0", limit: "3 GB" });
  });

  it("keeps the unit when they differ", () => {
    expect(storagePair(300 * 1024 ** 2, 3 * GB)).toEqual({ used: "300 MB", limit: "3 GB" });
  });
});

describe("sheetFrames", () => {
  const participants = [
    buildParticipant({ userId: "user-1", name: "Ada Lovelace" }),
    buildParticipant({ userId: "maya", name: "Maya Chen", accessLevel: "PARTICIPANT" }),
  ];
  const photos = [
    buildPhoto({ id: "c", addedById: "maya", createdAt: "2026-10-10T11:00:00.000Z" }),
    buildPhoto({ id: "b", addedById: "user-1", createdAt: "2026-10-10T10:00:00.000Z" }),
    buildPhoto({ id: "a", addedById: null, createdAt: "2026-10-09T10:00:00.000Z" }),
  ];

  it("numbers newest-first frames by their place on the roll and signs them", () => {
    const frames = sheetFrames(photos, participants, "user-1", null, "You");
    expect(frames.map((frame) => [frame.number, frame.by])).toEqual([
      [3, "Maya"],
      [2, "You"],
      [1, null],
    ]);
    expect(frames.every((frame) => !frame.isNew)).toBe(true);
  });

  it("ticks other people's frames added since the last visit", () => {
    const frames = sheetFrames(photos, participants, "user-1", "2026-10-09T12:00:00.000Z", "You");
    expect(frames.map((frame) => frame.isNew)).toEqual([true, false, false]);
  });
});

describe("shouldShowOpened", () => {
  const event = buildEvent({ galleryState: "OPEN", galleryOpensAt: "2026-10-10T10:00:00.000Z" });

  it("shows to someone who last looked before it opened", () => {
    expect(shouldShowOpened(event, "2026-10-09T10:00:00.000Z")).toBe(true);
  });

  it("doesn't show again, or to someone who never looked", () => {
    expect(shouldShowOpened(event, "2026-10-10T11:00:00.000Z")).toBe(false);
    expect(shouldShowOpened(event, null)).toBe(false);
  });

  it("doesn't show on a held roll", () => {
    expect(shouldShowOpened({ ...event, status: "UNDER_REVIEW" }, "2026-10-09T10:00:00.000Z")).toBe(false);
  });
});

describe("hostName", () => {
  it("names the creator, or the first host once they've gone", () => {
    const participants = [
      buildParticipant({ userId: "maya", name: "Maya Chen", accessLevel: "ORGANIZER" }),
      buildParticipant({ userId: "sam", name: "Sam Rivera", accessLevel: "ORGANIZER" }),
    ];
    expect(hostName(buildEvent({ creatorId: "sam" }), participants)).toBe("Sam");
    expect(hostName(buildEvent({ creatorId: null }), participants)).toBe("Maya");
    expect(hostName(buildEvent({ creatorId: null }), [])).toBeNull();
  });
});

test("storagePair rounds the used side down, and a full roll reads 3 / 3 GB", () => {
  expect(storagePair(3 * 1024 ** 3 - 6 * 1024 ** 2, 3 * 1024 ** 3)).toEqual({ used: "2.9", limit: "3 GB" });
  expect(storagePair(3 * 1024 ** 3, 3 * 1024 ** 3)).toEqual({ used: "3", limit: "3 GB" });
});
