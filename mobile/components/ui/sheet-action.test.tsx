import { render, screen, userEvent } from "@testing-library/react-native";
import { QrCode } from "phosphor-react-native";
import { SheetAction } from "./sheet-action";

test("presses through to the action", async () => {
  const onPress = jest.fn();
  await render(<SheetAction label="Send the envelope" icon={QrCode} onPress={onPress} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Send the envelope" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
