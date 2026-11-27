import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ContactFrame } from "./contact-frame";

test("opens on press and keeps the accessibility label without a visible frame number", async () => {
  const onPress = jest.fn();
  await render(<ContactFrame number={144} accessibilityLabel="Photo 144 by Leila" onPress={onPress} />);
  expect(screen.queryByText(/144/, { includeHiddenElements: true })).toBeNull();
  await fireEvent.press(screen.getByLabelText("Photo 144 by Leila"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("marks a frame that didn't make it with the warning icon, hidden from screen readers", async () => {
  await render(<ContactFrame number={150} crossed accessibilityLabel="Photo 150, didn't take" />);
  expect(screen.queryByTestId("frame-upload-error")).toBeNull();
  expect(screen.getByTestId("frame-upload-error", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText("!", { includeHiddenElements: true })).toBeNull();
});

test("shows the photo when its thumbnail is missing, and reports it ready", async () => {
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
      accessibilityLabel="Photo 7, by Leila"
    />,
  );
  // An older photo's thumbnail is tried once more before the photo stands in.
  jest.useFakeTimers();
  try {
    await fireEvent(screen.getByTestId("contact-frame-photo"), "error", { nativeEvent: { error: "404" } });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await fireEvent(screen.getByTestId("contact-frame-photo"), "error", { nativeEvent: { error: "404" } });
  } finally {
    jest.useRealTimers();
  }
  expect(screen.getByTestId("contact-frame-photo").props.source).toEqual([fallback]);
  await fireEvent(screen.getByTestId("contact-frame-photo"), "display");
  expect(onPreviewReady).toHaveBeenCalledTimes(1);
});

test("reports the selected state", async () => {
  await render(<ContactFrame number={145} selected accessibilityLabel="Photo 145" />);
  expect(screen.getByLabelText("Photo 145")).toBeSelected();
});

test("develops from a warm blur to sharp", async () => {
  await render(<ContactFrame uri="file://photo.jpg" number={150} develop={0.25} accessibilityLabel="Photo 150" />);
  expect(screen.getByTestId("frame-developing")).toHaveStyle({ opacity: 0.55 * 0.75 });

  await render(<ContactFrame uri="file://photo.jpg" number={150} develop={1} accessibilityLabel="Photo 150" />);
  expect(screen.queryByTestId("frame-developing")).toBeNull();
});

test("darkens a frame that didn't make it", async () => {
  await render(<ContactFrame uri="file://photo.jpg" number={150} crossed develop={0} accessibilityLabel="Photo 150" />);
  expect(screen.getByTestId("frame-crossed")).toBeOnTheScreen();
  expect(screen.queryByTestId("frame-developing")).toBeNull();
});
