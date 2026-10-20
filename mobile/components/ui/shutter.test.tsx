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

test("shows a lock while adding photos is closed", async () => {
  const onPress = jest.fn();
  await render(<Shutter accessibilityLabel="Adding photos opens Sat 19:00" locked onPress={onPress} />);
  const shutter = screen.getByRole("button", { name: "Adding photos opens Sat 19:00" });
  expect(shutter).toBeDisabled();
  expect(screen.getByTestId("phosphor-LockSimple")).toBeTruthy();
  fireEvent.press(shutter);
  expect(onPress).not.toHaveBeenCalled();
});
