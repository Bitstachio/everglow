import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import { ARRIVAL_NOTE_MS, ordinalCategory, useArrivalNote } from "./use-arrival-note";

let mockParams: { arrival?: string; place?: string } = {};
const mockSetParams = jest.fn();
jest.mock("expo-router", () => ({
  router: { setParams: (...args: unknown[]) => mockSetParams(...args) },
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  mockParams = {};
  mockSetParams.mockReset();
});

const render = () => renderHook(() => useArrivalNote(), { wrapper: I18nProvider });

test.each([
  ["1", "You’re on the roll · 1st"],
  ["2", "You’re on the roll · 2nd"],
  ["23", "You’re on the roll · 23rd"],
  ["25", "You’re on the roll · 25th"],
  ["11", "You’re on the roll · 11th"],
])("says which member a guest became: %s", async (place, note) => {
  mockParams = { arrival: "joined", place };
  const { result } = await render();
  expect(result.current).toBe(note);
});

test("leaves the place out when the route has none", async () => {
  mockParams = { arrival: "joined" };
  const { result } = await render();
  expect(result.current).toBe("You’re on the roll");
});

test("says when they were already on the roll", async () => {
  mockParams = { arrival: "already" };
  const { result } = await render();
  expect(result.current).toBe("You’re already on this roll");
});

test("shows nothing on a roll opened any other way", async () => {
  const { result } = await render();
  expect(result.current).toBeNull();
});

test("goes after a few seconds and clears the route, so coming back doesn't repeat it", async () => {
  jest.useFakeTimers();
  try {
    mockParams = { arrival: "already" };
    const { result } = await render();
    await act(async () => {
      jest.advanceTimersByTime(ARRIVAL_NOTE_MS);
    });
    expect(result.current).toBeNull();
    expect(mockSetParams).toHaveBeenCalledWith({ arrival: undefined, place: undefined });
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  [1, "one"],
  [2, "two"],
  [3, "few"],
  [4, "other"],
  [11, "other"],
  [12, "other"],
  [13, "other"],
  [21, "one"],
  [22, "two"],
  [23, "few"],
  [101, "one"],
  [111, "other"],
] as const)("place %i takes the %s ending", (place, category) => {
  expect(ordinalCategory(place, "en")).toBe(category);
});

test("falls back to English's rule where the engine has no ordinal plurals, as on Hermes", () => {
  // Hermes ignores the ordinal type and answers with cardinal rules: 2 is "other".
  const cardinalOnly = jest
    .spyOn(Intl, "PluralRules")
    .mockImplementation(() => ({ select: () => "other" }) as unknown as Intl.PluralRules);
  try {
    expect(ordinalCategory(3, "en")).toBe("few");
    expect(ordinalCategory(22, "en")).toBe("two");
  } finally {
    cardinalOnly.mockRestore();
  }
});
