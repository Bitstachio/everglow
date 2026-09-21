import { render, screen, userEvent } from "@testing-library/react-native";
import { EventsListSortButton } from "./events-list-sort-button";

test("shows ascending label and toggles when pressed", async () => {
  const onPress = jest.fn();
  await render(<EventsListSortButton direction="asc" onPress={onPress} />);
  expect(screen.getByRole("button", { name: "Sort by date ascending" })).toBeOnTheScreen();
  expect(screen.getByText("Date")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Sort by date ascending" }));
  expect(onPress).toHaveBeenCalled();
});

test("shows descending label", async () => {
  await render(<EventsListSortButton direction="desc" onPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Sort by date descending" })).toBeOnTheScreen();
});
