import { render, screen, userEvent } from "@testing-library/react-native";
import { BackButton, TopBar } from "./top-bar";

test("names the place as a header and keeps both sides", async () => {
  const onBack = jest.fn();
  await render(<TopBar title="You" left={<BackButton accessibilityLabel="Back" onPress={onBack} />} />);
  expect(screen.getByRole("header", { name: "You" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
