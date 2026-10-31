import "../../testing/native-mocks";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { buildPhoto } from "../../testing/fixtures";
import { FrameViewer } from "./frame-viewer";

const props = (): ComponentProps<typeof FrameViewer> => ({
  frame: { photo: buildPhoto(), number: 1, by: "You", isNew: false },
  canDelete: false,
  isSaving: false,
  canSave: true,
  isDeleting: false,
  confirmDeleteVisible: false,
  onClose: jest.fn(),
  onRetry: jest.fn().mockResolvedValue(undefined),
  onSave: jest.fn(),
  onDelete: jest.fn(),
  onCancelDelete: jest.fn(),
  onConfirmDelete: jest.fn(),
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
