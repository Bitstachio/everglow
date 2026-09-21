import { ThemedText } from "@/components/ui/themed-text";
import { render, screen, userEvent } from "@testing-library/react-native";
import { BottomSheet } from "./bottom-sheet";

test("renders title and children when visible", async () => {
  await render(
    <BottomSheet visible onClose={jest.fn()} title="Sheet title">
      <ThemedText>Sheet body</ThemedText>
    </BottomSheet>,
  );
  expect(screen.getByText("Sheet title")).toBeOnTheScreen();
  expect(screen.getByText("Sheet body")).toBeOnTheScreen();
});

test("hides content when not visible", async () => {
  await render(
    <BottomSheet visible={false} onClose={jest.fn()} title="Sheet title">
      <ThemedText>Sheet body</ThemedText>
    </BottomSheet>,
  );
  expect(screen.queryByText("Sheet title")).not.toBeOnTheScreen();
  expect(screen.queryByText("Sheet body")).not.toBeOnTheScreen();
});

test("calls onClose from scrim and close button", async () => {
  const onClose = jest.fn();
  await render(
    <BottomSheet
      visible
      onClose={onClose}
      title="Sheet title"
      dismissAccessibilityLabel="Dismiss sheet"
      closeAccessibilityLabel="Close sheet"
    >
      <ThemedText>Sheet body</ThemedText>
    </BottomSheet>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Dismiss sheet" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole("button", { name: "Close sheet" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
