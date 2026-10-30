import { renderWithI18n } from "@/testing/render";
import { screen, userEvent, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { TrayItem } from "../lib/upload-tray";
import UploadTrayScreen from "./upload-tray-screen";

const mockBack = jest.fn();
const mockCancelRest = jest.fn();
const mockRetry = jest.fn();
const mockRetryOne = jest.fn();
const mockRemove = jest.fn();
let mockEntries: (TrayItem & { progress?: number })[] = [];

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));
jest.mock("../hooks/use-upload-tray-screen", () => ({
  useUploadTrayScreen: () => ({
    title: "Sam & Jo’s wedding",
    entries: mockEntries,
    summary: jest
      .requireActual<typeof import("../lib/upload-tray-view")>("../lib/upload-tray-view")
      .summarizeTray({ items: mockEntries, running: false, closed: null }),
    onBack: mockBack,
    onCancelRest: mockCancelRest,
    onRetry: mockRetry,
    onRetryOne: mockRetryOne,
    onRemove: mockRemove,
  }),
}));

const MB = 1024 * 1024;

const entry = (name: string, status: TrayItem["status"], progress?: number): TrayItem & { progress?: number } => ({
  key: name,
  name,
  uri: `file://${name}.jpg`,
  contentType: "image/jpeg",
  sizeBytes: 3.4 * MB,
  status,
  progress,
});

const renderScreen = () =>
  renderWithI18n(<UploadTrayScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });

/** The screen's title, under the top bar's. */
const title = () => screen.getAllByRole("header").at(-1);

beforeEach(() => {
  jest.clearAllMocks();
});

test("08.3: shows each file's progress, and can cancel the rest or go back", async () => {
  mockEntries = [
    entry("IMG_2231", { kind: "developed", photoId: "p1" }),
    entry("IMG_2234", { kind: "sending", bytesSent: 1.7 * MB }, 0.5),
    entry("IMG_2251", { kind: "waiting" }),
  ];
  await renderScreen();

  expect(screen.getByRole("header", { name: /In the tray/ })).toHaveTextContent("In the tray\n1 of 3 uploaded");
  expect(screen.getByLabelText("IMG_2231, Uploaded")).toBeOnTheScreen();
  expect(screen.queryByText("IMG_2231")).not.toBeOnTheScreen();
  expect(screen.queryByText(/Developed ·/)).not.toBeOnTheScreen();
  expect(screen.getAllByTestId("tray-row-photo", { includeHiddenElements: true })[0]!.props.source).toEqual([
    { uri: "file://IMG_2231.jpg" },
  ]);
  expect(screen.getByRole("progressbar", { name: "IMG_2234, Uploading" })).toHaveAccessibilityValue({
    min: 0,
    max: 100,
    now: 50,
  });
  expect(screen.queryByText(/MB/)).not.toBeOnTheScreen();
  expect(screen.getByLabelText("IMG_2251, Waiting")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Cancel the rest" }));
  expect(mockCancelRest).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Hide/ })).not.toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Back" }));
  expect(mockBack).toHaveBeenCalled();
});

test("08.5: says which can't be added and why, and removes them", async () => {
  mockEntries = [
    entry("IMG_2231", { kind: "waiting" }),
    entry("PANO_2251", { kind: "rejected", reason: "tooLarge" }),
    entry("IMG_2260.MOV", { kind: "rejected", reason: "video" }),
  ];
  await renderScreen();

  expect(title()).toHaveTextContent("1 developing,\n2 can’t be added.");
  expect(screen.getByLabelText("PANO_2251, Too large · over 25 MB")).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Remove IMG_2260.MOV from the tray" }));
  expect(mockRemove).toHaveBeenCalledWith("IMG_2260.MOV");
});

test("offers Retry for files that didn't take, not Cancel", async () => {
  mockEntries = [entry("IMG_2231", { kind: "failed", reason: "connection" })];
  await renderScreen();

  expect(title()).toHaveTextContent("1 didn’t take.\nRetry sends them again.");
  expect(screen.getByLabelText("IMG_2231, Failed · offline")).toBeOnTheScreen();
  expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cancel the rest" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry ↻" }));
  expect(mockRetry).toHaveBeenCalled();
});

test("an empty tray does not claim cancelled photos were uploaded", async () => {
  mockEntries = [];
  await renderScreen();
  expect(title()).toHaveTextContent("The tray is empty.\nNothing waiting here.");
});

test("each recoverable failure can be retried or removed independently", async () => {
  mockEntries = [
    entry("First", { kind: "failed", reason: "refused" }),
    entry("Second", { kind: "failed", reason: "interrupted" }),
  ];
  await renderScreen();
  const user = userEvent.setup();
  const retry = screen.getByRole("button", { name: "Retry First" });
  const remove = screen.getByRole("button", { name: "Remove Second from the tray" });
  expect(within(retry).queryByText(/Retry/)).not.toBeOnTheScreen();
  expect(within(remove).queryByText(/Remove/)).not.toBeOnTheScreen();
  expect(within(retry).getByTestId("phosphor-ArrowClockwise", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(within(remove).getByTestId("phosphor-Trash", { includeHiddenElements: true })).toBeOnTheScreen();
  await user.press(retry);
  expect(mockRetryOne).toHaveBeenCalledWith("First");
  expect(mockRetry).not.toHaveBeenCalled();
  await user.press(remove);
  expect(mockRemove).toHaveBeenCalledWith("Second");
});

test("completed rows use a film thumbnail and Uploaded without a filename or frame number", async () => {
  mockEntries = [entry("IMG_2231", { kind: "developed", photoId: "p1" })];
  await renderScreen();
  expect(title()).toHaveTextContent("In the tray\n1 of 1 uploaded");
  expect(screen.getByLabelText("IMG_2231, Uploaded")).toBeOnTheScreen();
  expect(screen.queryByText("IMG_2231")).not.toBeOnTheScreen();
  expect(screen.queryByText(/Developed ·/)).not.toBeOnTheScreen();
  expect(screen.getAllByTestId("tray-row-photo", { includeHiddenElements: true })[0]!.props.source).toEqual([
    { uri: "file://IMG_2231.jpg" },
  ]);
  expect(screen.queryByRole("button", { name: "Cancel the rest" })).not.toBeOnTheScreen();
  expect(screen.queryByText("The tray is empty.")).not.toBeOnTheScreen();
});

test.each(["noRoom", "closed"] as const)(
  "a %s failure keeps its reason and never calls the tray empty",
  async (reason) => {
    mockEntries = [entry("IMG_2231", { kind: "failed", reason })];
    await renderScreen();
    expect(screen.getByRole("button", { name: "Remove IMG_2231 from the tray" })).toBeOnTheScreen();
    expect(screen.queryByText("The tray is empty.")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Retry ↻" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove IMG_2231 from the tray" })).toBeOnTheScreen();
  },
);
