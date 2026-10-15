import { fireEvent, render, screen } from "@testing-library/react-native";
import { ContactFrame } from "./contact-frame";

test("labels the frame with its number and who took it, and opens on press", async () => {
  const onPress = jest.fn();
  await render(<ContactFrame number={144} by="Leila" accessibilityLabel="Frame 144 by Leila" onPress={onPress} />);
  expect(screen.getByText(/· Leila/)).toBeOnTheScreen();
  fireEvent.press(screen.getByLabelText("Frame 144 by Leila"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("reports the selected state", async () => {
  await render(<ContactFrame number={145} selected accessibilityLabel="Frame 145" />);
  expect(screen.getByLabelText("Frame 145")).toBeSelected();
});
