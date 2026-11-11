import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ContactFrame } from "./contact-frame";

test("shows the uploader without a visible frame number, and opens on press", async () => {
  const onPress = jest.fn();
  await render(<ContactFrame number={144} by="Leila" accessibilityLabel="Frame 144 by Leila" onPress={onPress} />);
  expect(screen.getByText("Leila", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText(/144/, { includeHiddenElements: true })).toBeNull();
  await fireEvent.press(screen.getByLabelText("Frame 144 by Leila"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("screen readers hear the frame's label once, not its portrait and caption again", async () => {
  await render(<ContactFrame number={144} by="Maya" avatar={<Text>M</Text>} accessibilityLabel="Frame 144, by Maya" />);
  expect(screen.getByLabelText("Frame 144, by Maya")).toBeOnTheScreen();
  expect(screen.queryByText("M")).toBeNull();
  expect(screen.queryByText("Maya")).toBeNull();
  expect(screen.getByText("M", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("marks a frame that didn't make it with the warning icon, hidden from screen readers", async () => {
  await render(<ContactFrame number={150} crossed accessibilityLabel="Frame 150, didn't take" />);
  expect(screen.queryByTestId("frame-upload-error")).toBeNull();
  expect(screen.getByTestId("frame-upload-error", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText("!", { includeHiddenElements: true })).toBeNull();
});

test("shows the photo when its thumbnail is missing, keeping the uploader, and reports it ready", async () => {
  const onPreviewReady = jest.fn();
  const fallback = { uri: "https://bucket/photo.jpg", cacheKey: "photo:1:original" };
  await render(
    <ContactFrame
      uri="https://bucket/thumb.webp"
      cacheKey="photo:1:frame-thumbnail"
      fallback={fallback}
      mayBeLate={false}
      onPreviewReady={onPreviewReady}
      number={7}
      by="Leila"
      accessibilityLabel="Frame 7, by Leila"
    />,
  );
  await fireEvent(screen.getByTestId("contact-frame-photo"), "error", { nativeEvent: { error: "404" } });
  expect(screen.getByTestId("contact-frame-photo").props.source).toEqual([fallback]);
  expect(screen.getByText("Leila", { includeHiddenElements: true })).toBeOnTheScreen();
  await fireEvent(screen.getByTestId("contact-frame-photo"), "display");
  expect(onPreviewReady).toHaveBeenCalledTimes(1);
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
