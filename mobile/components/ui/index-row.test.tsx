import { render, screen, userEvent } from "@testing-library/react-native";
import { IndexRow } from "./index-row";

test("a row that opens somewhere is a button named with its value", async () => {
  const onPress = jest.fn();
  await render(<IndexRow label="Username" value="@ada" onPress={onPress} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Username, @ada" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByText("@ada ›")).toBeOnTheScreen();
});

test("a row without an action only shows its value", async () => {
  await render(<IndexRow label="Email" value="ada@example.com" />);
  expect(screen.queryByRole("button")).not.toBeOnTheScreen();
  expect(screen.getByLabelText("Email, ada@example.com")).toBeOnTheScreen();
});

test("a disabled row does not open", async () => {
  const onPress = jest.fn();
  await render(<IndexRow label="Sign out" onPress={onPress} disabled />);
  const row = screen.getByRole("button", { name: "Sign out" });
  expect(row).toBeDisabled();
  await userEvent.setup().press(row);
  expect(onPress).not.toHaveBeenCalled();
});
