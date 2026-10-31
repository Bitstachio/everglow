import "../testing/native-mocks";
import { act, fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { Dimensions, Platform } from "react-native";
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

const props = (): ComponentProps<typeof FrameViewer> => {
  const frame = { photo: buildPhoto(), number: 1, by: "You", uploader: null, isNew: false };
  return {
    frame,
    canDelete: false,
    isOwn: true,
    frames: [frame],
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
  };
};

const pageWidth = Dimensions.get("window").width;
const pageScroll = (x: number) => ({
  nativeEvent: {
    contentOffset: { x, y: 0 },
    contentSize: { width: pageWidth * 2, height: 600 },
    layoutMeasurement: { width: pageWidth, height: 600 },
  },
});

test("paging reveals thumbnail previews and selects an original only when the page settles", async () => {
  const input = props();
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 };
  input.frames = [input.frame!, second];
  const view = await render(<FrameViewer {...input} />);
  const pager = screen.getByTestId("frame-viewer-pager");
  expect(pager.props.pagingEnabled).toBe(true);
  expect(screen.getByTestId("frame-preview-photo-2", { includeHiddenElements: true }).props.source[0].cacheKey).toBe(
    "photo:photo-2:thumbnail",
  );
  await fireEvent.scroll(pager, pageScroll(pageWidth / 2));
  expect(input.onMove).not.toHaveBeenCalled();
  expect(screen.getAllByTestId("frame-viewer-photo")).toHaveLength(1);
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-1:original");
  await userEvent.setup().scrollTo(pager, {
    x: pageWidth * 0.7,
    momentumX: pageWidth,
    contentSize: { width: pageWidth * 2, height: 600 },
    layoutMeasurement: { width: pageWidth, height: 600 },
  });
  expect(input.onMove).toHaveBeenCalledTimes(1);
  expect(input.onMove).toHaveBeenCalledWith("photo-2");
  await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} />);
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-2:original");
  expect(screen.getByTestId("frame-viewer-photo").props.placeholder[0].cacheKey).toBe("photo:photo-2:thumbnail");
  expect(screen.getAllByTestId("frame-viewer-photo")).toHaveLength(1);
  await fireEvent(screen.getByTestId("frame-viewer-pager"), "momentumScrollEnd", pageScroll(0));
  expect(input.onMove).toHaveBeenLastCalledWith("photo-1");
});

test("a cancelled drag returns to the same photo without loading another original", async () => {
  const input = props();
  input.frames = [input.frame!, { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 }];
  await render(<FrameViewer {...input} />);
  await userEvent.setup().scrollTo(screen.getByTestId("frame-viewer-pager"), {
    x: pageWidth / 4,
    momentumX: 0,
    contentSize: { width: pageWidth * 2, height: 600 },
    layoutMeasurement: { width: pageWidth, height: 600 },
  });
  expect(input.onMove).not.toHaveBeenCalled();
  expect(screen.getByTestId("frame-viewer-photo").props.source[0].cacheKey).toBe("photo:photo-1:original");
});

test("a parent refresh during paging uses the latest selection callback and prefetches at the loaded end", async () => {
  const input = props();
  input.frames = [input.frame!, { ...input.frame!, photo: buildPhoto({ id: "photo-2" }), number: 2 }];
  const view = await render(<FrameViewer {...input} hasMore />);
  await fireEvent.scroll(screen.getByTestId("frame-viewer-pager"), pageScroll(pageWidth / 2));
  const refreshedMove = jest.fn();
  await view.rerender(<FrameViewer {...input} hasMore onMove={refreshedMove} notice="Saved" />);
  await fireEvent(screen.getByTestId("frame-viewer-pager"), "momentumScrollEnd", pageScroll(pageWidth));
  expect(refreshedMove).toHaveBeenCalledTimes(1);
  expect(refreshedMove).toHaveBeenCalledWith("photo-2");
  expect(input.onMove).not.toHaveBeenCalled();
  expect(input.onLoadMore).toHaveBeenCalledTimes(1);
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
  const second = { ...input.frame!, photo: buildPhoto({ id: "photo-2", url: "https://cdn.example.com/second" }) };
  input.frames = [input.frame!, second];
  let completeRenewal!: () => void;
  input.onRetry = jest.fn(() => new Promise<void>((resolve) => (completeRenewal = resolve)));
  const view = await render(<FrameViewer {...input} />);
  await fireEvent(screen.getByTestId("frame-viewer-photo"), "error", { nativeEvent: { error: "HTTP 403" } });
  expect(input.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Loading photo")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn’t load this photo.")).not.toBeOnTheScreen();
  expect(screen.queryByTestId("frame-viewer-photo")).not.toBeOnTheScreen();

  await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} />);
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
    await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} />);
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
  await view.rerender(<FrameViewer {...input} frames={[input.frame!, second]} frame={second} isOwn={false} />);
  await act(async () => screen.getByTestId("frame-menu-dialog", { includeHiddenElements: true }).props.onDismiss());
  expect(input.onSave).not.toHaveBeenCalled();
  await user.press(screen.getAllByRole("button", { name: "More" })[0]);
  expect(screen.getByText("Leila’s frame")).toBeOnTheScreen();
});
