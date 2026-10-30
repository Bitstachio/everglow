import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { TrayItem } from "../lib/upload-tray";
import type { TrayEntry } from "../lib/upload-tray-view";
import UploadTrayScreen from "./upload-tray-screen";

const mockHide = jest.fn();
const mockCancelRest = jest.fn();
const mockRetry = jest.fn();
const mockRetryOne = jest.fn();
const mockRemove = jest.fn();
let mockEntries: TrayEntry[] = [];

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));
jest.mock("../hooks/use-upload-tray-screen", () => ({
  useUploadTrayScreen: () => ({
    title: "Sam & Jo’s wedding",
    entries: mockEntries,
    summary: jest
      .requireActual<typeof import("../lib/upload-tray-view")>("../lib/upload-tray-view")
      .summarizeTray({ items: mockEntries.map((entry) => entry.item), running: false, closed: null }),
    onHide: mockHide,
    onCancelRest: mockCancelRest,
    onRetry: mockRetry,
    onRetryOne: mockRetryOne,
    onRemove: mockRemove,
  }),
}));

const MB = 1024 * 1024;

const entry = (name: string, status: TrayItem["status"], number: number | null = null): TrayEntry => ({
  item: { key: name, name, uri: `file://${name}.jpg`, contentType: "image/jpeg", sizeBytes: 3.4 * MB, status },
  number,
  develop: status.kind === "developed" ? 1 : 0,
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

test("08.3: shows each file's progress, and can cancel the rest or hide", async () => {
  mockEntries = [
    entry("IMG_2231", { kind: "developed", photoId: "p1" }, 149),
    entry("IMG_2234", { kind: "sending", bytesSent: 2.1 * MB }, 151),
    entry("IMG_2251", { kind: "waiting" }, 153),
  ];
  await renderScreen();

  expect(screen.getByRole("header", { name: /In the tray/ })).toHaveTextContent("In the tray\n1 of 3 developed");
  expect(screen.getByLabelText("IMG_2231, Developed · 149")).toBeOnTheScreen();
  expect(screen.getByLabelText("IMG_2234, 2.1 / 3.4 MB")).toBeOnTheScreen();
  expect(screen.getByLabelText("IMG_2251, Waiting")).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Cancel the rest" }));
  expect(mockCancelRest).toHaveBeenCalled();
  await user.press(screen.getAllByRole("button", { name: "Hide ›" })[0]!);
  expect(mockHide).toHaveBeenCalled();
});

test("08.5: says which can't be added and why, and removes them", async () => {
  mockEntries = [
    entry("IMG_2231", { kind: "waiting" }, 150),
    entry("PANO_2251", { kind: "rejected", reason: "tooLarge" }),
    entry("IMG_2260.MOV", { kind: "rejected", reason: "video" }),
  ];
  await renderScreen();

  expect(title()).toHaveTextContent("1 developing,\n2 can’t be added.");
  expect(screen.getByLabelText("PANO_2251, PANO_2251 is over 25 MB and can’t be added")).toBeOnTheScreen();

  await userEvent.setup().press(screen.getByRole("button", { name: "Remove IMG_2260.MOV from the tray" }));
  expect(mockRemove).toHaveBeenCalledWith("IMG_2260.MOV");
});

test("offers Retry for files that didn't take, not Cancel", async () => {
  mockEntries = [entry("IMG_2231", { kind: "failed", reason: "connection" }, 150)];
  await renderScreen();

  expect(title()).toHaveTextContent("1 didn’t take.\nRetry sends them again.");
  expect(screen.getByLabelText("IMG_2231, Didn’t take · offline")).toBeOnTheScreen();
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
  await user.press(screen.getByRole("button", { name: "Retry First" }));
  expect(mockRetryOne).toHaveBeenCalledWith("First");
  expect(mockRetry).not.toHaveBeenCalled();
  await user.press(screen.getByRole("button", { name: "Remove Second from the tray" }));
  expect(mockRemove).toHaveBeenCalledWith("Second");
});

test("completed rows show success even before a frame number is available", async () => {
  mockEntries = [entry("IMG_2231", { kind: "developed", photoId: "p1" })];
  await renderScreen();
  expect(title()).toHaveTextContent("In the tray\n1 of 1 developed");
  expect(screen.getByLabelText("IMG_2231, Uploaded")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Cancel the rest" })).not.toBeOnTheScreen();
  expect(screen.queryByText("The tray is empty.")).not.toBeOnTheScreen();
});

test.each(["noRoom", "closed"] as const)(
  "a %s failure keeps its reason and never calls the tray empty",
  async (reason) => {
    mockEntries = [entry("IMG_2231", { kind: "failed", reason })];
    await renderScreen();
    expect(screen.getByText("IMG_2231")).toBeOnTheScreen();
    expect(screen.queryByText("The tray is empty.")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Retry ↻" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove IMG_2231 from the tray" })).toBeOnTheScreen();
  },
);
