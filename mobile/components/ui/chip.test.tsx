import { render, screen, userEvent } from "@testing-library/react-native";
import { View } from "react-native";
import { Chip } from "./chip";

test("renders the label and forwards presses", async () => {
  const onPress = jest.fn();
  await render(<Chip label="Filters" onPress={onPress} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Filters" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("exposes selected state", async () => {
  await render(<Chip label="Organizer" selected variant="soft" onPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Organizer" })).toHaveProp("accessibilityState", {
    selected: true,
    disabled: false,
  });
});

test("renders a leading icon", async () => {
  await render(<Chip label="Filters" icon={<View testID="chip-icon" />} onPress={jest.fn()} />);
  expect(screen.getByTestId("chip-icon")).toBeOnTheScreen();
});
