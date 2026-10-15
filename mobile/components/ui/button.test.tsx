import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./button";

test("renders the title and forwards presses", async () => {
  const onPress = jest.fn();
  await render(<Button title="Continue" onPress={onPress} />);
  fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("shows a busy spinner and blocks presses while loading", async () => {
  const onPress = jest.fn();
  await render(<Button title="Save" isLoading onPress={onPress} />);
  expect(screen.queryByText("Save")).not.toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onPress).not.toHaveBeenCalled();
});

test("honors the disabled prop", async () => {
  const onPress = jest.fn();
  await render(<Button title="Join" disabled onPress={onPress} />);
  expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "Join" }));
  expect(onPress).not.toHaveBeenCalled();
});

test("a destructive leader carries a warning icon and names the action", async () => {
  await render(<Button title="Cut and remove 148" variant="danger" mark="▸" />);
  expect(screen.getByRole("button", { name: "Cut and remove 148" })).toBeOnTheScreen();
  expect(screen.getByTestId("phosphor-Warning")).toBeOnTheScreen();
});

test("the leader's end mark is decorative", async () => {
  await render(<Button title="Load the roll" mark="▸" />);
  expect(screen.queryByText("▸")).not.toBeOnTheScreen();
  expect(screen.getByText("▸", { includeHiddenElements: true })).toHaveProp("importantForAccessibility", "no");
});
