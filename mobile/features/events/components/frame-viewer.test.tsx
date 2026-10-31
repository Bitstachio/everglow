import "../testing/native-mocks";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { buildPhoto } from "../testing/fixtures";
import { FrameViewer } from "./frame-viewer";

const props = (): ComponentProps<typeof FrameViewer> => ({
  frame: { photo: buildPhoto(), number: 1, by: "You", uploader: null, isNew: false },
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
