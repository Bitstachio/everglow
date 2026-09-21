import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import { DEFAULT_EVENTS_LIST_FILTERS } from "../../utils";
import { useEventsListFiltersSheet } from "./use-events-list-filters-sheet";

const setup = (overrides?: Partial<Parameters<typeof useEventsListFiltersSheet>[0]>) =>
  renderHook(
    (props: Parameters<typeof useEventsListFiltersSheet>[0]) => useEventsListFiltersSheet(props),
    {
      initialProps: {
        visible: true,
        draft: DEFAULT_EVENTS_LIST_FILTERS,
        onChangeDateFrom: jest.fn(),
        onChangeDateTo: jest.fn(),
        ...overrides,
      },
    },
  );

test("toggles the active date field", async () => {
  const { result } = await setup();
  expect(result.current.activeDateField).toBeNull();

  await act(async () => {
    result.current.toggleDateField("from");
  });
  expect(result.current.activeDateField).toBe("from");

  await act(async () => {
    result.current.toggleDateField("from");
  });
  expect(result.current.activeDateField).toBeNull();
});

test("clears the active date field when the sheet hides", async () => {
  const { result, rerender } = await setup();
  await act(async () => {
    result.current.toggleDateField("to");
  });
  expect(result.current.activeDateField).toBe("to");

  await act(async () => {
    rerender({
      visible: false,
      draft: DEFAULT_EVENTS_LIST_FILTERS,
      onChangeDateFrom: jest.fn(),
      onChangeDateTo: jest.fn(),
    });
  });
  expect(result.current.activeDateField).toBeNull();
});

test.each(["ios", "android"] as const)("applies a selected date on %s", async (os) => {
  Platform.OS = os;
  const onChangeDateFrom = jest.fn();
  const { result } = await setup({ onChangeDateFrom });

  await act(async () => {
    result.current.toggleDateField("from");
  });
  await act(async () => {
    result.current.handleDateChange({ type: "set" }, new Date(2026, 8, 15));
  });

  expect(onChangeDateFrom).toHaveBeenCalledWith("2026-09-15");
  if (os === "android") expect(result.current.activeDateField).toBeNull();
  else expect(result.current.activeDateField).toBe("from");
});
