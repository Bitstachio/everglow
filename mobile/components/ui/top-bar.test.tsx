import { render, screen, userEvent } from "@testing-library/react-native";
import { BackButton, CloseButton, TopBar } from "./top-bar";

test("names the place as a header and keeps both sides", async () => {
  const onBack = jest.fn();
  await render(<TopBar title="You" left={<BackButton accessibilityLabel="Back" onPress={onBack} />} />);
  expect(screen.getByRole("header", { name: "You" })).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("close on paper uses the shared chrome tone", async () => {
  const onClose = jest.fn();
  await render(
    <TopBar tone="paper" left={<CloseButton accessibilityLabel="Close" onPress={onClose} tone="paper" />} />,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
