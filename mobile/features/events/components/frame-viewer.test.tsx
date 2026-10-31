import "../testing/native-mocks";
import { act, fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { Platform } from "react-native";
import type { ComponentProps } from "react";
import { buildPhoto } from "../testing/fixtures";
import { FrameViewer } from "./frame-viewer/frame-viewer";

// iOS keeps the closing modal's contents mounted until its native fade ends.
// The default Jest mock removes them as soon as visible becomes false.
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: ({ visible, children, ...rest }: import("react-native").ModalProps) => (
      <View {...rest} {...{ visible }} accessibilityElementsHidden={!visible}>
        {children}
      </View>
    ),
  };
});

const props = (): ComponentProps<typeof FrameViewer> => ({
  frame: { photo: buildPhoto(), number: 1, by: "You", uploader: null, isNew: false },
  canDelete: false,
  isOwn: true,
  frames: [],
  busy: false,
  notice: null,
  failedSaveCount: 0,
  onRetrySave: jest.fn(),
  onShare: jest.fn(),
  onMove: jest.fn(),
  onLoadMore: jest.fn(),
  hasMore: false,
  isDeleting: false,
  deleteTargets: null,
  onClose: jest.fn(),
  onRetry: jest.fn().mockResolvedValue(undefined),
  onSave: jest.fn(),
  onDelete: jest.fn(),
  onCancelDelete: jest.fn(),
  onConfirmDelete: jest.fn(),
});

// Exercise the real PanResponder with native touch history; RNTL has no swipe API.
const touchEvent = (dx = 0, dy = 0) => ({
  nativeEvent: { touches: [{ pageX: 200 + dx, pageY: 200 + dy }] },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: dx || dy ? 200 : 100,
    touchBank: [
      {
        touchActive: true,
        startPageX: 200,
        startPageY: 200,
        startTimeStamp: 100,
        previousPageX: 200,
        previousPageY: 200,
        previousTimeStamp: 100,
        currentPageX: 200 + dx,
        currentPageY: 200 + dy,
        currentTimeStamp: dx || dy ? 200 : 100,
      },
    ],
  },
});

const startSwipe = async (dx: number, dy = 0) => {
  const viewport = screen.getByTestId("frame-viewer-viewport");
  const start = touchEvent();
  await fireEvent(viewport, "startShouldSetResponderCapture", start);
  // iOS needs a responder at touch start to deliver the photo's movement.
  expect(viewport.props.onStartShouldSetResponder(start)).toBe(true);
  await fireEvent(viewport, "responderGrant", start);
  await fireEvent(viewport, "responderMove", touchEvent(dx, dy));
};

const finishSwipe = async () => {
  await fireEvent(screen.getByTestId("frame-viewer-viewport"), "responderRelease", touchEvent());
};

test("photo swipes navigate both ways and survive a parent refresh during the gesture", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 };
  input.frames = [input.frame!, second];
  const view = await render(<FrameViewer {...input} />);
  await startSwipe(-120);
  const refreshedMove = jest.fn();
  await view.rerender(<FrameViewer {...input} onMove={refreshedMove} notice="Saved" />);
  await finishSwipe();
  expect(refreshedMove).toHaveBeenCalledTimes(1);
  expect(refreshedMove).toHaveBeenCalledWith("photo-2");
  expect(input.onMove).not.toHaveBeenCalled();

  await view.rerender(<FrameViewer {...input} frame={second} />);
  await startSwipe(120);
  await finishSwipe();
  expect(input.onMove).toHaveBeenCalledTimes(1);
  expect(input.onMove).toHaveBeenCalledWith("photo-1");
});

test.each([
  [0, 0],
  [30, 0],
  [15, 120],
  [-90, 100],
])("a tap, short drag or vertical gesture does not change photos (%s, %s)", async (dx, dy) => {
  const input = props();
  input.frames = [input.frame!, { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 }];
  await render(<FrameViewer {...input} />);
  await startSwipe(dx, dy);
  await finishSwipe();
  expect(input.onMove).not.toHaveBeenCalled();
});

test("swipes stop at the ends of the roll and request the next page at its loaded end", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 };
  input.frames = [input.frame!, second];
  const view = await render(<FrameViewer {...input} />);
  await startSwipe(120);
  await finishSwipe();
  await view.rerender(<FrameViewer {...input} frame={second} hasMore />);
  await startSwipe(-120);
  await finishSwipe();
  expect(input.onMove).not.toHaveBeenCalled();
  expect(input.onLoadMore).toHaveBeenCalledTimes(1);
});

test("an interrupted gesture or a photo change during a swipe does not navigate", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 };
  input.frames = [input.frame!, second];
  const view = await render(<FrameViewer {...input} />);
  await startSwipe(-120);
  await fireEvent(screen.getByTestId("frame-viewer-viewport"), "responderTerminate", touchEvent());
  expect(input.onMove).not.toHaveBeenCalled();
  await startSwipe(120);
  await view.rerender(<FrameViewer {...input} frame={second} />);
  await finishSwipe();
  expect(input.onMove).not.toHaveBeenCalled();
});

test("a stalled original exposes retry after 30 seconds and resets when reopened", async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const input = props();
  const view = await render(<FrameViewer {...input} />);
  try {
    expect(screen.getByLabelText("Loading photo")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(screen.getByText("Couldn’t load this photo.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Loading photo")).not.toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith("photo.viewer.load_failed", { photoId: "photo-1", reason: "timeout" });
    await view.rerender(<FrameViewer {...input} frame={null} />);
    await view.rerender(<FrameViewer {...input} />);
    expect(screen.getByLabelText("Loading photo")).toBeOnTheScreen();
  } finally {
    await view.unmount();
    warn.mockRestore();
    jest.useRealTimers();
  }
});

test("displaying an original cancels the loading timeout", async () => {
  jest.useFakeTimers();
  const view = await render(<FrameViewer {...props()} />);
  try {
    await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(screen.queryByLabelText("Loading photo")).not.toBeOnTheScreen();
    expect(screen.queryByText("Couldn’t load this photo.")).not.toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
  } finally {
    await view.unmount();
    jest.useRealTimers();
  }
});

test("automatic renewal keeps loading visible and cannot replace a different photo opened while it waits", async () => {
  const input = props();
  let completeRenewal!: () => void;
  input.onRetry = jest.fn(() => new Promise<void>((resolve) => (completeRenewal = resolve)));
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
  expect(input.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Loading photo")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn’t load this photo.")).not.toBeOnTheScreen();
  expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();

  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2", url: "https://cdn.example.com/second" }) };
  await view.rerender(<FrameViewer {...input} frame={second} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
  await act(async () => completeRenewal());
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(second.photo.url);
  expect(screen.queryByLabelText("Loading photo")).not.toBeOnTheScreen();
});

test("the compact attribution retains accessible next/previous navigation", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 };
  input.frames = [input.frame!, second];
  const view = await render(<FrameViewer {...input} />);
  try {
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(input.onMove).toHaveBeenCalledWith("photo-2");
    input.onMove = jest.fn();
    await view.rerender(<FrameViewer {...input} frame={second} />);
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(input.onMove).toHaveBeenCalledWith("photo-1");
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save to Photos" })).toHaveTextContent("Save ↓");
  } finally {
    await view.unmount();
  }
});

test("iOS close preserves the photo and attribution until the native fade finishes", async () => {
  const input = props();
  input.frame = { ...input.frame!, by: "Leila" };
  const view = await render(<FrameViewer {...input} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Close frame" }));
  const closing = screen.getByTestId("frame-viewer-dialog", { includeHiddenElements: true });
  expect(closing.props.visible).toBe(false);
  expect(input.onClose).not.toHaveBeenCalled();
  expect(screen.getByTestId("frame-viewer-photo", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByRole("adjustable", { includeHiddenElements: true }).props.accessibilityLabel).toContain("Leila");
  expect(screen.queryByText("Unknown photographer", { includeHiddenElements: true })).not.toBeOnTheScreen();
  await act(async () => closing.props.onDismiss());
  expect(input.onClose).toHaveBeenCalledTimes(1);
  await view.rerender(<FrameViewer {...input} frame={null} />);
  expect(screen.queryByTestId("frame-viewer-dialog", { includeHiddenElements: true })).not.toBeOnTheScreen();
  await view.rerender(<FrameViewer {...input} />);
  expect(screen.getByRole("adjustable").props.accessibilityLabel).toContain("Leila");
});

test("Android close does not wait for the iOS-only dismissal event", async () => {
  const platform = jest.replaceProperty(Platform, "OS", "android");
  try {
    const input = props();
    await render(<FrameViewer {...input} />);
    await userEvent.setup().press(screen.getByRole("button", { name: "Close frame" }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
  } finally {
    platform.restore();
  }
});

test("changing photos clears a closing menu's deferred action", async () => {
  const input = props();
  const view = await render(<FrameViewer {...input} />);
  const user = userEvent.setup();
  await user.press(screen.getAllByRole("button", { name: "More" })[0]);
  await user.press(within(screen.getByTestId("frame-menu-dialog")).getByRole("button", { name: "Save to Photos" }));
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), by: "Leila" };
  await view.rerender(<FrameViewer {...input} frame={second} isOwn={false} />);
  await act(async () => screen.getByTestId("frame-menu-dialog", { includeHiddenElements: true }).props.onDismiss());
  expect(input.onSave).not.toHaveBeenCalled();
  await user.press(screen.getAllByRole("button", { name: "More" })[0]);
  expect(screen.getByText("Leila’s frame")).toBeOnTheScreen();
});
