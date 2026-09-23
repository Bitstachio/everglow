import { mockCameraPermission, mockRequestPermission, mockColorScheme } from "../testing/native-mocks";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QRScanner } from "./qr-scanner";

beforeEach(() => {
  mockCameraPermission.mockReturnValue({ granted: true });
  mockRequestPermission.mockReset();
  mockColorScheme.mockReturnValue("light");
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("waits for permission state", async () => {
  mockCameraPermission.mockReturnValue(null);
  await render(<QRScanner visible onClose={jest.fn()} onScan={jest.fn()} />);
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
  expect(screen.queryByText("Camera Access Required")).not.toBeOnTheScreen();
});

test.each(["light", "dark"])("explains missing permission and allows cancellation in %s mode", async (theme) => {
  mockColorScheme.mockReturnValue(theme);
  mockCameraPermission.mockReturnValue({ granted: false });
  const onClose = jest.fn();
  await render(<QRScanner visible onClose={onClose} onScan={jest.fn()} />);
  expect(screen.getByText("Camera Access Required")).toBeOnTheScreen();
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByText("Cancel"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([true, false])("requests permission and handles granted=%s", async (granted) => {
  mockCameraPermission.mockReturnValue({ granted: false });
  mockRequestPermission.mockResolvedValue({ granted });
  await render(<QRScanner visible onClose={jest.fn()} onScan={jest.fn()} />);
  await userEvent.setup().press(screen.getByText("Grant Permission"));
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  if (granted) expect(Alert.alert).not.toHaveBeenCalled();
  else
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Camera Permission Required",
        "Please enable camera access in your device settings to scan QR codes.",
      ),
    );
});

test("scans once, closes, and permits a later scan after cooldown", async () => {
  jest.useFakeTimers();
  const onScan = jest.fn();
  const onClose = jest.fn();
  await render(<QRScanner visible onClose={onClose} onScan={onScan} />);
  const camera = screen.getByTestId("camera");
  expect(camera).toHaveProp("barcodeScannerSettings", { barcodeTypes: ["qr"] });
  await fireEvent(camera, "barcodeScanned", { data: "invite-token" });
  await fireEvent(camera, "barcodeScanned", { data: "duplicate-token" });
  expect(onScan).toHaveBeenCalledTimes(1);
  expect(onScan).toHaveBeenCalledWith("invite-token");
  expect(onClose).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByTestId("camera").props.onBarcodeScanned).toEqual(expect.any(Function)));
  await fireEvent(screen.getByTestId("camera"), "barcodeScanned", { data: "another-token" });
  expect(onScan).toHaveBeenLastCalledWith("another-token");
});

test("closes the camera without scanning", async () => {
  const onClose = jest.fn();
  const onScan = jest.fn();
  await render(<QRScanner visible onClose={onClose} onScan={onScan} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Close scanner" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onScan).not.toHaveBeenCalled();
});

test("hides the camera when not visible", async () => {
  await render(<QRScanner visible={false} onClose={jest.fn()} onScan={jest.fn()} />);
  expect(screen.queryByTestId("camera")).not.toBeOnTheScreen();
});
