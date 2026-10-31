import "../../testing/native-mocks";
import { act, fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { Dimensions, Platform } from "react-native";
import type { ComponentProps } from "react";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { buildPhoto } from "../../testing/fixtures";
import { FrameViewer } from "./frame-viewer";
import { PAGE_GAP } from "./paging";

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

const props = (): ComponentProps<typeof FrameViewer> => {
  const frame = { photo: buildPhoto(), number: 1, by: "You", uploader: null, isNew: false };
  return {
    frame,
    canDelete: false,
    isOwn: true,
    frames: [frame],
    busy: false,
    notice: null,
    progressLabel: "Preparing frames",
    unsavedCount: 0,
    onRetrySave: jest.fn(),
    onDismissUnsaved: jest.fn(),
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
    blocking: null,
    onCancelBlock: jest.fn(),
    onConfirmBlock: jest.fn(),
  };
};

const stride = Dimensions.get("window").width + PAGE_GAP;
const roll = (count: number) =>
  Array.from({ length: count }, (_, page) => ({
    photo: buildPhoto({
      id: `photo-${page + 1}`,
      url: `https://cdn.example.com/photo-${page + 1}.jpg`,
      thumbnailUrl: `https://cdn.example.com/photo-${page + 1}-thumb.webp`,
    }),
    number: page + 1,
    by: "You",
    uploader: null,
    isNew: false,
  }));

/** Renders the viewer with fake timers and lets the pager's UI-thread reactions start. */
const renderPager = async (input: ComponentProps<typeof FrameViewer>) => {
  jest.useFakeTimers();
  const view = await render(<FrameViewer {...input} />);
  await act(async () => jest.advanceTimersByTime(50));
  return view;
};

type PanEvent = { translationX?: number; translationY?: number; velocityX?: number; velocityY?: number };
/** A one-finger drag through the given points, released with the last one's velocity. */
const drag = async (...points: PanEvent[]) => {
  const last = points[points.length - 1];
  await act(async () => {
    fireGestureHandler(getByGestureTestId("frame-viewer-pan"), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      {
        state: State.ACTIVE,
        translationX: Math.sign(points[0].translationX ?? 0) * 10,
        translationY: Math.sign(points[0].translationY ?? 0) * 10,
      },
      ...points.map((point) => ({ translationX: 0, translationY: 0, ...point })),
      { state: State.END, translationX: 0, translationY: 0, velocityX: 0, velocityY: 0, ...last },
    ]);
    jest.advanceTimersByTime(1000);
  });
};

afterEach(() => {
  jest.useRealTimers();
});

test("only a window of frames is mounted: originals one either side, thumbnails two either side", async () => {
  const input = props();
  input.frames = roll(1000);
  input.frame = input.frames[500];
  await render(<FrameViewer {...input} />);
  const mounted = (id: string) => screen.queryByTestId(`frame-page-${id}`, { includeHiddenElements: true });
  expect(mounted("photo-498")).not.toBeOnTheScreen();
  expect(mounted("photo-504")).not.toBeOnTheScreen();
  for (const page of [499, 500, 501, 502, 503]) expect(mounted(`photo-${page}`)).toBeOnTheScreen();
  expect(
    screen.getAllByTestId(/^frame-original-/, { includeHiddenElements: true }).map((node) => node.props.testID),
  ).toEqual(["frame-original-photo-500", "frame-original-photo-502"]);
  expect(screen.getByTestId("frame-viewer-photo").props.source[0]).toEqual({
    uri: "https://cdn.example.com/photo-501.jpg",
    cacheKey: "photo:photo-501:original",
  });
  expect(screen.getByTestId("frame-viewer-thumbnail").props.source[0].cacheKey).toBe("photo:photo-501:thumbnail");
  expect(screen.getByTestId("frame-preview-photo-499", { includeHiddenElements: true }).props.source[0].cacheKey).toBe(
    "photo:photo-499:thumbnail",
  );
});

test("a swipe selects the next frame as it passes halfway, before the finger lifts", async () => {
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[1];
  await renderPager(input);
  await drag({ translationX: -stride * 0.3 }, { translationX: -stride * 0.6 }, { translationX: -stride * 0.3 });
  // Past halfway it moved on; dragging back and releasing slowly returned to the frame it left.
  expect(input.onMove).toHaveBeenCalledTimes(1);
  expect(input.onMove).toHaveBeenCalledWith("photo-3");
});

test("a flick moves on after a short drag; a slow short drag springs back", async () => {
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[1];
  await renderPager(input);
  await drag({ translationX: -stride * 0.3, velocityX: -100 });
  expect(input.onMove).not.toHaveBeenCalled();
  await drag({ translationX: stride * 0.1, velocityX: 1200 });
  expect(input.onMove).toHaveBeenCalledTimes(1);
  expect(input.onMove).toHaveBeenCalledWith("photo-1");
});

test("the first and last frames rubber-band instead of moving on", async () => {
  const input = props();
  input.frames = roll(2);
  const view = await renderPager(input);
  await drag({ translationX: stride * 0.8, velocityX: 2000 });
  expect(input.onMove).not.toHaveBeenCalled();
  await view.rerender(<FrameViewer {...input} frame={input.frames[1]} />);
  await drag({ translationX: -stride * 0.8, velocityX: -2000 });
  expect(input.onMove).not.toHaveBeenCalled();
});

test("a preloaded neighbour is already sharp when it becomes current", async () => {
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[0];
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-original-photo-2", { includeHiddenElements: true }), "display");
  await view.rerender(<FrameViewer {...input} frame={input.frames[1]} />);
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-2:original");
  expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
  // The neighbour that is now one away starts loading its original too.
  expect(screen.getByTestId("frame-original-photo-3", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("zooming disables paging until the frame is back at rest", async () => {
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[1];
  await renderPager(input);
  const doubleTap = async () =>
    act(async () => {
      fireGestureHandler(getByGestureTestId("frame-viewer-double-tap"), [
        { state: State.BEGAN, x: 100, y: 100 },
        { state: State.ACTIVE, x: 100, y: 100 },
        { state: State.END, x: 100, y: 100 },
      ]);
      jest.advanceTimersByTime(1000);
    });
  await doubleTap();
  await drag({ translationX: -stride * 0.8, velocityX: -2000 });
  expect(input.onMove).not.toHaveBeenCalled();
  await doubleTap();
  await drag({ translationX: -stride * 0.8, velocityX: -2000 });
  expect(input.onMove).toHaveBeenCalledWith("photo-3");
});

test("a pinch zooms the current frame and disables paging", async () => {
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[1];
  await renderPager(input);
  await act(async () => {
    fireGestureHandler(getByGestureTestId("frame-viewer-pinch"), [
      { state: State.BEGAN, scale: 1, focalX: 100, focalY: 100 },
      { state: State.ACTIVE, scale: 1, focalX: 100, focalY: 100 },
      { scale: 2, focalX: 100, focalY: 100 },
      { state: State.END, scale: 2, focalX: 100, focalY: 100 },
    ]);
    jest.advanceTimersByTime(1000);
  });
  await drag({ translationX: -stride * 0.8, velocityX: -2000 });
  expect(input.onMove).not.toHaveBeenCalled();
});

test("dragging the photo down closes the viewer; a short drag springs back", async () => {
  const input = props();
  await renderPager(input);
  await drag({ translationY: 60, velocityY: 100 });
  expect(screen.getByTestId("frame-viewer-dialog").props.visible).toBe(true);
  await drag({ translationY: 220, velocityY: 300 });
  expect(screen.getByTestId("frame-viewer-dialog", { includeHiddenElements: true }).props.visible).toBe(false);
});

test("tapping a strip frame moves the viewer there", async () => {
  const input = props();
  input.frames = roll(6);
  const view = await renderPager(input);
  await userEvent
    .setup({ advanceTimers: jest.advanceTimersByTime })
    .press(screen.getByRole("imagebutton", { name: "Frame 5, by You" }));
  expect(input.onMove).toHaveBeenCalledWith("photo-5");
  await view.rerender(<FrameViewer {...input} frame={input.frames[4]} />);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-5:original");
  expect(screen.queryByTestId("frame-page-photo-1", { includeHiddenElements: true })).not.toBeOnTheScreen();
});

test("reaching the loaded end asks for more frames once", async () => {
  const input = props();
  input.frames = roll(10);
  input.frame = input.frames[2];
  const view = await render(<FrameViewer {...input} hasMore />);
  expect(input.onLoadMore).not.toHaveBeenCalled();
  await view.rerender(<FrameViewer {...input} hasMore frame={input.frames[7]} notice="Saved" />);
  expect(input.onLoadMore).toHaveBeenCalledTimes(1);
  await view.rerender(<FrameViewer {...input} hasMore frame={input.frames[7]} notice={null} />);
  expect(input.onLoadMore).toHaveBeenCalledTimes(1);
});

test("save progress and results sit over the photo and keep it on screen", async () => {
  const input = props();
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
  await view.rerender(<FrameViewer {...input} busy progressLabel="Saving 1 of 1" />);
  expect(screen.getByTestId("frame-viewer-status")).toHaveStyle({ position: "absolute", bottom: 0 });
  expect(within(screen.getByTestId("frame-viewer-status")).getByText("Saving 1 of 1")).toBeOnTheScreen();
  await view.rerender(<FrameViewer {...input} notice="Saved to Photos." />);
  expect(within(screen.getByTestId("frame-viewer-status")).getByText("Saved to Photos.")).toBeOnTheScreen();
  await view.rerender(<FrameViewer {...input} unsavedCount={1} />);
  expect(
    within(screen.getByTestId("frame-viewer-status")).getByRole("button", { name: "Retry 1 unsaved" }),
  ).toBeOnTheScreen();
  expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
  expect(screen.getByTestId("frame-viewer-thumbnail")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
});

test("a stalled original exposes retry after 30 seconds and resets when reopened", async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const input = props();
  const view = await render(<FrameViewer {...input} />);
  try {
    expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith("photo.viewer.load_failed", { photoId: "photo-1", reason: "timeout" });
    await view.rerender(<FrameViewer {...input} frame={null} />);
    await view.rerender(<FrameViewer {...input} />);
    expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
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
    expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
    expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
  } finally {
    await view.unmount();
    jest.useRealTimers();
  }
});

test("a slow original keeps loading while bytes arrive, and gives up only once they stop", async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const view = await render(<FrameViewer {...props()} />);
  try {
    // Two minutes of a slow download, a chunk every 20 seconds.
    for (let loaded = 1; loaded <= 6; loaded += 1) {
      await act(async () => jest.advanceTimersByTime(20_000));
      await fireEvent(screen.getByTestId("frame-viewer-photo"), "progress", {
        nativeEvent: { loaded: loaded * 1024, total: 10 * 1024 },
      });
    }
    expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
    expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(29_000));
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1_000));
    expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith("photo.viewer.load_failed", { photoId: "photo-1", reason: "timeout" });
  } finally {
    await view.unmount();
    warn.mockRestore();
    jest.useRealTimers();
  }
});

test("Try again renews the link and starts a new stall timer", async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const input = props();
  const view = await render(<FrameViewer {...input} />);
  try {
    await act(async () => jest.advanceTimersByTime(30_000));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(input.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(29_000));
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1_000));
    expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
  } finally {
    await view.unmount();
    warn.mockRestore();
    jest.useRealTimers();
  }
});

test("a renewal shows the thumbnail and doesn't count toward the stall timer", async () => {
  jest.useFakeTimers();
  const input = props();
  let completeRenewal!: () => void;
  input.onRetry = jest.fn(() => new Promise<void>((resolve) => (completeRenewal = resolve)));
  const view = await render(<FrameViewer {...input} />);
  try {
    await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
    expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-thumbnail").props.source[0].cacheKey).toBe("photo:photo-1:thumbnail");
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
    await act(async () => completeRenewal());
    expect(screen.getByTestId("frame-viewer-photo")).toBeOnTheScreen();
    expect(screen.getByTestId("frame-viewer-thumbnail")).toBeOnTheScreen();
  } finally {
    await view.unmount();
    jest.useRealTimers();
  }
});

test("a renewal loads the links it resolves with, before the contact sheet catches up", async () => {
  const input = props();
  input.onRetry = jest.fn().mockResolvedValue({
    url: "https://cdn.example.com/renewed.jpg",
    thumbnailUrl: "https://cdn.example.com/renewed-thumb.webp",
  });
  await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
  await act(async () => {});
  expect(input.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("frame-viewer-photo").props.source[0]).toEqual({
    uri: "https://cdn.example.com/renewed.jpg",
    cacheKey: "photo:photo-1:original",
  });
});

test("a neighbour that fails waits, then renews its link once it is current", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[0];
  const view = await render(<FrameViewer {...input} />);
  try {
    await fireEvent(screen.getByTestId("frame-original-photo-2", { includeHiddenElements: true }), "error", {
      nativeEvent: { error: "HTTP 403" },
    });
    // Renewal follows the open frame, so a neighbour's failure can't use it yet.
    expect(input.onRetry).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
    await view.rerender(<FrameViewer {...input} frame={input.frames[1]} />);
    expect(input.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
    await act(async () => {});
    expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-2:original");
    // That was this visit's renewal; another error offers Try again.
    await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
    expect(input.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
  } finally {
    warn.mockRestore();
  }
});

test("a neighbour still loading has no deadline until it is current", async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const input = props();
  input.frames = roll(3);
  input.frame = input.frames[0];
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
  await act(async () => jest.advanceTimersByTime(60_000));
  await view.rerender(<FrameViewer {...input} frame={input.frames[1]} />);
  expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(30_000));
  expect(screen.getByText("Couldn’t load this frame.")).toBeOnTheScreen();
  expect(warn).toHaveBeenCalledWith("photo.viewer.load_failed", { photoId: "photo-2", reason: "timeout" });
  await view.unmount();
  warn.mockRestore();
});

test("the time reads on a 24-hour clock that starts at 00", async () => {
  const input = props();
  const midnight = new Date(2026, 9, 31, 0, 5).toISOString();
  input.frame = { ...input.frame!, photo: buildPhoto({ createdAt: midnight }) };
  await render(<FrameViewer {...input} />);
  expect(screen.getByRole("adjustable").props.accessibilityLabel).toMatch(/00:05$/);
});

test("a save under way can be stopped, and what didn't save can be retried or let go", async () => {
  const input = props();
  const onStop = jest.fn();
  const view = await render(<FrameViewer {...input} busy progressLabel="Saving 1 of 3" onStop={onStop} />);
  const user = userEvent.setup();
  expect(screen.getByText("Saving 1 of 3")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Stop saving or sharing" }));
  expect(onStop).toHaveBeenCalledTimes(1);

  await view.rerender(<FrameViewer {...input} unsavedCount={2} />);
  await user.press(screen.getByRole("button", { name: "Retry 2 unsaved" }));
  expect(input.onRetrySave).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole("button", { name: "Dismiss unsaved frames" }));
  expect(input.onDismissUnsaved).toHaveBeenCalledTimes(1);
});

test("automatic renewal keeps loading visible and cannot replace a different photo opened while it waits", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2", url: "https://cdn.example.com/second" }) };
  input.frames = [input.frame!, second];
  let completeRenewal!: () => void;
  input.onRetry = jest.fn(() => new Promise<void>((resolve) => (completeRenewal = resolve)));
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
  expect(input.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Loading frame")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn’t load this frame.")).not.toBeOnTheScreen();
  expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();

  await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "display");
  await act(async () => completeRenewal());
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].uri).toBe(second.photo.url);
  expect(screen.queryByLabelText("Loading frame")).not.toBeOnTheScreen();
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
    await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} />);
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(input.onMove).toHaveBeenCalledWith("photo-1");
    expect(screen.queryByRole("button", { name: "Next frame" })).not.toBeOnTheScreen();
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
  await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} isOwn={false} />);
  await act(async () => screen.getByTestId("frame-menu-dialog", { includeHiddenElements: true }).props.onDismiss());
  expect(input.onSave).not.toHaveBeenCalled();
  await user.press(screen.getAllByRole("button", { name: "More" })[0]);
  expect(screen.getByText("Leila’s frame")).toBeOnTheScreen();
});
