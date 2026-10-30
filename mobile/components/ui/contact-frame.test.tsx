import { fireEvent, render, screen } from "@testing-library/react-native";
import { ContactFrame } from "./contact-frame";

test("shows the uploader without a visible frame number, and opens on press", async () => {
  const onPress = jest.fn();
  await render(<ContactFrame number={144} by="Leila" accessibilityLabel="Frame 144 by Leila" onPress={onPress} />);
  expect(screen.getByText("Leila")).toBeOnTheScreen();
  expect(screen.queryByText(/144/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Frame 144 by Leila"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("reports the selected state", async () => {
  await render(<ContactFrame number={145} selected accessibilityLabel="Frame 145" />);
  expect(screen.getByLabelText("Frame 145")).toBeSelected();
});

test("develops from a warm blur to sharp", async () => {
  await render(<ContactFrame uri="file://photo.jpg" number={150} develop={0.25} accessibilityLabel="Frame 150" />);
  expect(screen.getByTestId("frame-developing")).toHaveStyle({ opacity: 0.55 * 0.75 });

  await render(<ContactFrame uri="file://photo.jpg" number={150} develop={1} accessibilityLabel="Frame 150" />);
  expect(screen.queryByTestId("frame-developing")).toBeNull();
});

test("darkens a frame that didn't make it", async () => {
  await render(<ContactFrame uri="file://photo.jpg" number={150} crossed develop={0} accessibilityLabel="Frame 150" />);
  expect(screen.getByTestId("frame-crossed")).toBeOnTheScreen();
  expect(screen.queryByTestId("frame-developing")).toBeNull();
});
