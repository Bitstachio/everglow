import { fireEvent, render, screen } from "@testing-library/react-native";
import { Shutter } from "./shutter";

test("is a button that adds photos, with its label", async () => {
  const onPress = jest.fn();
  await render(<Shutter accessibilityLabel="Add photos" label="Add photos" onPress={onPress} />);
  fireEvent.press(screen.getByRole("button", { name: "Add photos" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("can be locked until the roll opens", async () => {
  await render(<Shutter accessibilityLabel="Add photos" disabled />);
  expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled();
});
