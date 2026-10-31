import "../testing/native-mocks";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { buildPhoto } from "../testing/fixtures";
import { FrameViewer } from "./frame-viewer/frame-viewer";

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
