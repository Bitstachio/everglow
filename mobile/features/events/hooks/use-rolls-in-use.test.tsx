import { I18nProvider } from "@/providers/i18n-provider";
import { renderHook } from "@testing-library/react-native";
import { buildEvent } from "../testing/fixtures";
import type { Event, UserLimitsResponseDto } from "../types";
import { useRollsInUse } from "./use-rolls-in-use";

let mockEvents: Event[] = [];
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
jest.mock("../api/queries", () => ({ useEventsQuery: () => ({ data: mockEvents }) }));

const party = buildEvent({
  id: "party",
  title: "Nadia turns 30",
  galleryState: "OPEN",
  galleryClosesAt: new Date(2026, 10, 14, 19).toISOString(),
});
const wedding = buildEvent({
  id: "wedding",
  title: "Sam & Jo",
  galleryState: "UPCOMING",
  galleryOpensAt: new Date(2026, 11, 5, 16).toISOString(),
  galleryClosesAt: new Date(2027, 0, 4, 16).toISOString(),
});
const joined = buildEvent({ id: "joined", creatorId: "user-2", galleryState: "OPEN" });

const limits = (overrides: Partial<UserLimitsResponseDto> = {}): UserLimitsResponseDto => ({
  plan: "FREE",
  limits: { activeEvents: 2 },
  usage: { activeEvents: 2 },
  nextClosingEvent: { id: "party", title: "Nadia turns 30", galleryClosesAt: party.galleryClosesAt! },
  newEvent: {
    plan: "FREE",
    galleryWindowOptions: [3, 7, 14, 30],
    defaultGalleryWindowDays: 30,
    latestDate: "2027-11-01T00:00:00.000Z",
  },
  ...overrides,
});

const run = (data: UserLimitsResponseDto | undefined, hitLimit = false) =>
  renderHook(() => useRollsInUse(data, hitLimit), { wrapper: I18nProvider });

beforeEach(() => {
  mockEvents = [party, wedding, joined];
});

test("has nothing to say while there is room, or no limit", async () => {
  expect((await run(undefined)).result.current).toBeNull();
  expect((await run(limits({ usage: { activeEvents: 1 } }))).result.current).toBeNull();
  expect((await run(limits({ limits: { activeEvents: null } }), true)).result.current).toBeNull();
});

test("says how many rolls are running and which frees a spot first", async () => {
  const { result } = await run(limits());

  expect(result.current).toMatchObject({
    edge: "Free plan · 2 of 2 running",
    title: "Both rolls",
    dim: "are in use.",
    runs: "A free account runs 2 rolls at a time.",
    next: { title: "Nadia turns 30", date: "Sat 14 Nov" },
  });
  // Only rolls you started count; the one that frees a spot comes last, with its note.
  expect(result.current?.rolls.map(({ event, note }) => [event.id, note])).toEqual([
    ["wedding", undefined],
    ["party", "free on 14 Nov ↑"],
  ]);
});

test("reads the numbers from the plan, never from the app", async () => {
  const { result } = await run(
    limits({ limits: { activeEvents: 3 }, usage: { activeEvents: 3 }, nextClosingEvent: null }),
  );

  expect(result.current).toMatchObject({
    edge: "Free plan · 3 of 3 running",
    title: "All 3 rolls",
    runs: "A free account runs 3 rolls at a time.",
    next: null,
  });
  expect(result.current?.rolls.every(({ note }) => note === undefined)).toBe(true);
});

test("believes a refused create over limits read earlier", async () => {
  const { result } = await run(limits({ usage: { activeEvents: 1 } }), true);
  expect(result.current?.edge).toBe("Free plan · 1 of 2 running");
});
