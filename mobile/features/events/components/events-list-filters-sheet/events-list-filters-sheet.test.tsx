import "../../testing/date-picker-mock";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Platform } from "react-native";
import { DEFAULT_EVENTS_LIST_FILTERS } from "../../utils";
import { EventsListFiltersSheet } from "./events-list-filters-sheet";

test("toggles multiple role chips and applies filters", async () => {
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
  await user.press(screen.getByRole("button", { name: "Filter by Participant" }));
  expect(onChangeRole).toHaveBeenCalledWith("PARTICIPANT");
  await user.press(screen.getByRole("button", { name: "Apply filters" }));
  expect(onApply).toHaveBeenCalled();
});

test("shows selected multi-select role chips", async () => {
  await render(
    <EventsListFiltersSheet
      visible
      draft={{ roles: ["ORGANIZER", "VIEWER"], dateFrom: null, dateTo: null }}
      onClose={jest.fn()}
      onChangeRole={jest.fn()}
      onChangeDateFrom={jest.fn()}
      onChangeDateTo={jest.fn()}
      onReset={jest.fn()}
      onApply={jest.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Filter by Organizer" })).toHaveProp("accessibilityState", {
    selected: true,
  });
  expect(screen.getByRole("button", { name: "Filter by Participant" })).toHaveProp("accessibilityState", {
    selected: false,
  });
  expect(screen.getByRole("button", { name: "Filter by Viewer" })).toHaveProp("accessibilityState", {
    selected: true,
  });
});

test("resets and closes from the sheet actions", async () => {
  const onReset = jest.fn();
  const onClose = jest.fn();
  await render(
    <EventsListFiltersSheet
      visible
      draft={{ roles: ["ORGANIZER"], dateFrom: "2026-09-01", dateTo: null }}
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

test("wires the date picker display and change handler", async () => {
  Platform.OS = "ios";
  const onChangeDateFrom = jest.fn();
  await render(
    <EventsListFiltersSheet
      visible
      draft={DEFAULT_EVENTS_LIST_FILTERS}
      onClose={jest.fn()}
      onChangeRole={jest.fn()}
      onChangeDateFrom={onChangeDateFrom}
      onChangeDateTo={jest.fn()}
      onReset={jest.fn()}
      onApply={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Filter from date" }));
  expect(screen.getByTestId("date-picker")).toHaveProp("display", "spinner");
  await fireEvent(screen.getByTestId("date-picker"), "change", { type: "set" }, new Date(2026, 8, 15));
  expect(onChangeDateFrom).toHaveBeenCalledWith("2026-09-15");
});
