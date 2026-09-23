import { render, screen, userEvent } from "@testing-library/react-native";
import { EventsListSortButton } from "./events-list-sort-button";

test("shows earliest date label and toggles when pressed", async () => {
  const onPress = jest.fn();
  await render(<EventsListSortButton direction="asc" onPress={onPress} />);
  expect(screen.getByRole("button", { name: "Date · Earliest" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Date · Earliest" }));
  expect(onPress).toHaveBeenCalled();
});

test("shows latest date label", async () => {
  await render(<EventsListSortButton direction="desc" onPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Date · Latest" })).toBeOnTheScreen();
});
