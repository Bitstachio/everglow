import { render, screen, userEvent } from "@testing-library/react-native";
import { QrCode } from "phosphor-react-native";
import { MenuAction } from "./menu-action";

test("presses through to the action", async () => {
  const onPress = jest.fn();
  await render(<MenuAction label="Send the envelope" icon={QrCode} onPress={onPress} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Send the envelope" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("a muted action dims its label", async () => {
  await render(<MenuAction muted label="Leave the roll" icon={QrCode} onPress={jest.fn()} />);
  expect(screen.getByText("Leave the roll")).toHaveProp("className", expect.stringContaining("text-edge"));
});
