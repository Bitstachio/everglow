import { render, screen } from "@testing-library/react-native";
import { FrameCounter } from "./frame-counter";

test("shows the count as two digits and says it in full", async () => {
  await render(<FrameCounter count={7} label="Frames" accessibilityLabel="7 frames on the roll" />);
  expect(screen.getByLabelText("7 frames on the roll")).toBeOnTheScreen();
  expect(screen.getByText("07", { includeHiddenElements: true })).toBeTruthy();
});
