import { render, screen } from "@testing-library/react-native";
import { FrameCounter } from "./frame-counter";

test("shows the count as two digits and says it in full", async () => {
  await render(<FrameCounter count={7} label="Photos" accessibilityLabel="7 photos in the event" />);
  expect(screen.getByLabelText("7 photos in the event")).toBeOnTheScreen();
  expect(screen.getByText("07", { includeHiddenElements: true })).toBeTruthy();
});
