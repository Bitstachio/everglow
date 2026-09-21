import "../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Platform } from "react-native";
import { EventsListFiltersSheet } from "./events-list-filters-sheet";
import { DEFAULT_EVENTS_LIST_FILTERS } from "../utils";

test("selects a role chip and applies filters", async () => {
  const onChangeRole = jest.fn();
  const onApply = jest.fn();
  await render(
    <EventsListFiltersSheet
      visible
      draft={DEFAULT_EVENTS_LIST_FILTERS}
      onClose={jest.fn()}
      onChangeRole={onChangeRole}
      onChangeDateFrom={jest.fn()}
      onChangeDateTo={jest.fn()}
      onReset={jest.fn()}
      onApply={onApply}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Filter by Organizer" }));
  expect(onChangeRole).toHaveBeenCalledWith("ORGANIZER");
  await user.press(screen.getByRole("button", { name: "Apply filters" }));
  expect(onApply).toHaveBeenCalled();
});

test("resets and closes from the sheet actions", async () => {
  const onReset = jest.fn();
  const onClose = jest.fn();
  await render(
    <EventsListFiltersSheet
      visible
      draft={{ role: "ORGANIZER", dateFrom: "2026-09-01", dateTo: null }}
      onClose={onClose}
      onChangeRole={jest.fn()}
      onChangeDateFrom={jest.fn()}
      onChangeDateTo={jest.fn()}
      onReset={onReset}
      onApply={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Reset filters" }));
  expect(onReset).toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Close filters" }));
  expect(onClose).toHaveBeenCalled();
});

test.each(["ios", "android"] as const)("picks from and to dates with the %s date picker", async (os) => {
  Platform.OS = os;
  const onChangeDateFrom = jest.fn();
  const onChangeDateTo = jest.fn();
  await render(
    <EventsListFiltersSheet
      visible
      draft={DEFAULT_EVENTS_LIST_FILTERS}
      onClose={jest.fn()}
      onChangeRole={jest.fn()}
      onChangeDateFrom={onChangeDateFrom}
      onChangeDateTo={onChangeDateTo}
      onReset={jest.fn()}
      onApply={jest.fn()}
    />,
  );
  const user = userEvent.setup();

  await user.press(screen.getByRole("button", { name: "Filter from date" }));
  expect(screen.getByTestId("date-picker")).toHaveProp("display", os === "ios" ? "spinner" : "default");
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2026, 8, 15));
  expect(onChangeDateFrom).toHaveBeenCalledWith("2026-09-15");
  if (os === "android") expect(screen.queryByTestId("date-picker")).not.toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Filter to date" }));
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2026, 8, 30));
  expect(onChangeDateTo).toHaveBeenCalledWith("2026-09-30");
});
