import { render, screen, userEvent } from "@testing-library/react-native";
import { Input } from "./input";

test("renders label, value, and error", async () => {
  await render(<Input label="Email" value="a@b.com" error="Invalid email" onChangeText={jest.fn()} />);
  expect(screen.getByText("Email")).toBeOnTheScreen();
  expect(screen.getByDisplayValue("a@b.com")).toBeOnTheScreen();
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid email");
});

test("forwards text changes", async () => {
  const onChangeText = jest.fn();
  await render(<Input label="Name" value="" onChangeText={onChangeText} />);
  await userEvent.setup().type(screen.getByDisplayValue(""), "Alex");
  expect(onChangeText).toHaveBeenCalled();
});

test("toggles password visibility", async () => {
  await render(<Input label="Password" value="secret" secureTextEntry onChangeText={jest.fn()} />);
  const field = screen.getByDisplayValue("secret");
  expect(field).toHaveProp("secureTextEntry", true);
  await userEvent.setup().press(screen.getByRole("button", { name: "Show password" }));
  expect(field).toHaveProp("secureTextEntry", false);
  await userEvent.setup().press(screen.getByRole("button", { name: "Hide password" }));
  expect(field).toHaveProp("secureTextEntry", true);
});

test("blocks editing when disabled", async () => {
  await render(<Input label="Locked" value="x" editable={false} onChangeText={jest.fn()} />);
  expect(screen.getByDisplayValue("x")).toHaveProp("editable", false);
});
