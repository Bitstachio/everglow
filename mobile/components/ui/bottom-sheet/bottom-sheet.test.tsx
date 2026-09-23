import { ThemedText } from "@/components/ui/themed-text";
import { render, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheet } from "./bottom-sheet";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderSheet = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>);

test("renders title and children when visible", async () => {
  await renderSheet(
    <BottomSheet visible onClose={jest.fn()} title="Sheet title">
      <ThemedText>Sheet body</ThemedText>
    </BottomSheet>,
  );
  expect(screen.getByRole("header", { name: "Sheet title" })).toBeOnTheScreen();
  expect(screen.getByText("Sheet body")).toBeOnTheScreen();
});

test("hides content when not visible", async () => {
  await renderSheet(
    <BottomSheet visible={false} onClose={jest.fn()} title="Sheet title">
      <ThemedText>Sheet body</ThemedText>
    </BottomSheet>,
  );
  expect(screen.queryByText("Sheet title")).not.toBeOnTheScreen();
  expect(screen.queryByText("Sheet body")).not.toBeOnTheScreen();
});

test("calls onClose from scrim and close button", async () => {
  const onClose = jest.fn();
  await renderSheet(
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
