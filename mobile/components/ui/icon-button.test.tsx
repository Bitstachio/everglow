import { render, screen, userEvent } from "@testing-library/react-native";
import { ThemedText } from "./themed-text";
import { IconButton } from "./icon-button";

test("forwards presses with the accessibility label", async () => {
  const onPress = jest.fn();
  await render(
    <IconButton accessibilityLabel="Close" onPress={onPress}>
      <ThemedText>×</ThemedText>
    </IconButton>,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Close" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("honors disabled", async () => {
  const onPress = jest.fn();
  await render(
    <IconButton accessibilityLabel="Close" disabled onPress={onPress}>
      <ThemedText>×</ThemedText>
    </IconButton>,
  );
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Close" }));
  expect(onPress).not.toHaveBeenCalled();
});
