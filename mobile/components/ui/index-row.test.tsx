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

test("an action done on the spot has no arrow", async () => {
  await render(<IndexRow action label="Sign out" onPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Sign out" })).toBeOnTheScreen();
  expect(screen.queryByText("›")).not.toBeOnTheScreen();
});

test("a long label keeps to one line and leaves the value whole", async () => {
  await render(<IndexRow label="Leo’s first birthday at the lake house" value="Deleted · no one else on it" />);
  expect(screen.getByText("Leo’s first birthday at the lake house")).toHaveProp("numberOfLines", 1);
  expect(screen.getByText("Deleted · no one else on it")).toBeOnTheScreen();
});
