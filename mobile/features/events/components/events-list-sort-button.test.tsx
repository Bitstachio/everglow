import { render, screen, userEvent } from "@testing-library/react-native";
import { EventsListSortButton } from "./events-list-sort-button";

test("shows oldest-to-newest label and toggles when pressed", async () => {
  const onPress = jest.fn();
  await render(<EventsListSortButton direction="asc" onPress={onPress} />);
  expect(screen.getByRole("button", { name: "Oldest to newest" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Oldest to newest" }));
  expect(onPress).toHaveBeenCalled();
});

test("shows newest-to-oldest label", async () => {
  await render(<EventsListSortButton direction="desc" onPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Newest to oldest" })).toBeOnTheScreen();
});
