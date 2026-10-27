import { mockCameraPermission, mockRequestPermission } from "../testing/native-mocks";
import { renderWithI18n } from "@/testing/render";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
// The clipboard and Settings are native boundaries the screen hook reaches.
import { Clipboard, Linking } from "react-native";
import JoinScanScreen from "./join-scan-screen";

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
}));

const getClipboard = jest.fn<Promise<string>, []>();

beforeEach(() => {
  jest.clearAllMocks();
  mockCameraPermission.mockReturnValue({ granted: true, canAskAgain: true, status: "granted" } as never);
  mockRouter.canGoBack.mockReturnValue(true);
  getClipboard.mockResolvedValue("");
  jest.spyOn(Clipboard, "getString").mockImplementation(() => getClipboard());
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

const press = async (name: string | RegExp) => userEvent.setup().press(screen.getByRole("button", { name }));

describe("06.1 Scan", () => {
  test("says what it's looking for under the viewfinder", async () => {
    await renderWithI18n(<JoinScanScreen />);

    expect(screen.getByRole("header", { name: "Join a roll" })).toBeOnTheScreen();
    expect(screen.getByText("Looking for")).toBeOnTheScreen();
    expect(screen.getByText("an Everglow envelope")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Point at someone’s invite." })).toBeOnTheScreen();
    expect(screen.getByText("Any QR from an Everglow envelope or link works.")).toBeOnTheScreen();
    expect(screen.getByTestId("camera")).toHaveProp("barcodeScannerSettings", { barcodeTypes: ["qr"] });
  });

  test("opens the envelope behind a scanned link, once", async () => {
    await renderWithI18n(<JoinScanScreen />);

    await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: " https://everglow.social/join/k8Qm2 " });
    await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "https://everglow.social/join/k8Qm2" });

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/join/[token]", params: { token: "k8Qm2" } });
  });

  test("ignores a code with nothing in it", async () => {
    await renderWithI18n(<JoinScanScreen />);
    await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "   " });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("turns the light on and off", async () => {
    await renderWithI18n(<JoinScanScreen />);
    expect(screen.getByTestId("camera")).toHaveProp("enableTorch", false);

    await press("Turn on the light");
    expect(screen.getByTestId("camera")).toHaveProp("enableTorch", true);

    await press("Turn off the light");
    expect(screen.getByTestId("camera")).toHaveProp("enableTorch", false);
  });

  test("closes back to where it was opened, or to the rolls", async () => {
    await renderWithI18n(<JoinScanScreen />);
    await press("Close");
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValue(false);
    await press("Close");
    expect(mockRouter.replace).toHaveBeenCalledWith("/events");
  });

  test("asks for the camera the first time", async () => {
    mockCameraPermission.mockReturnValue({ granted: false, canAskAgain: true, status: "undetermined" } as never);
    await renderWithI18n(<JoinScanScreen />);

    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
  });

  test("waits while the camera permission is read", async () => {
    mockCameraPermission.mockReturnValue(null);
    await renderWithI18n(<JoinScanScreen />);

    expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
    expect(screen.queryByText("The camera is off")).not.toBeOnTheScreen();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  test("offers to allow the camera when it was refused, and keeps pasting open", async () => {
    mockCameraPermission.mockReturnValue({ granted: false, canAskAgain: true, status: "denied" } as never);
    await renderWithI18n(<JoinScanScreen />);

    expect(screen.getByText("The camera is off")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Turn on the light" })).not.toBeOnTheScreen();
    await press("Allow the camera");
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Paste a link instead" })).toBeOnTheScreen();
  });

  test("sends them to Settings once the system won't ask again", async () => {
    mockCameraPermission.mockReturnValue({ granted: false, canAskAgain: false, status: "denied" } as never);
    await renderWithI18n(<JoinScanScreen />);

    await press("Open Settings");
    expect(Linking.openSettings).toHaveBeenCalled();
  });
});

describe("06.2 Paste a link", () => {
  test("offers a link found on the clipboard", async () => {
    getClipboard.mockResolvedValue("  https://everglow.social/join/k8Qm2  ");
    await renderWithI18n(<JoinScanScreen />);

    await press("Paste a link instead");

    expect(await screen.findByText("Found on your clipboard")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "From a message?" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Invite link")).toHaveDisplayValue("https://everglow.social/join/k8Qm2");
    expect(screen.getByTestId("camera").props.onBarcodeScanned).toBeUndefined();

    await press("Open the envelope");
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/join/[token]", params: { token: "k8Qm2" } });
  });

  test("leaves the field empty when the clipboard holds something else", async () => {
    getClipboard.mockResolvedValue("see you at 8");
    await renderWithI18n(<JoinScanScreen />);

    await press("Paste a link instead");

    await waitFor(() => expect(getClipboard).toHaveBeenCalled());
    expect(screen.getByLabelText("Invite link")).toHaveDisplayValue("");
    expect(screen.queryByText("Found on your clipboard")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open the envelope" })).toBeDisabled();
  });

  test("opens a link typed in, without claiming it came from the clipboard", async () => {
    getClipboard.mockRejectedValue(new Error("denied"));
    await renderWithI18n(<JoinScanScreen />);
    await press("Paste a link instead");

    await userEvent.setup().paste(screen.getByLabelText("Invite link"), "everglow.social/join/abc123");

    expect(screen.queryByText("Found on your clipboard")).not.toBeOnTheScreen();
    await press("Open the envelope");
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/join/[token]", params: { token: "abc123" } });
  });

  test("an edited clipboard link is theirs now", async () => {
    getClipboard.mockResolvedValue("https://everglow.social/join/k8Qm2");
    await renderWithI18n(<JoinScanScreen />);
    await press("Paste a link instead");
    await screen.findByText("Found on your clipboard");

    await fireEvent.changeText(screen.getByLabelText("Invite link"), "https://everglow.social/join/k8Qm");

    expect(screen.queryByText("Found on your clipboard")).not.toBeOnTheScreen();
  });
});
