import { renderWithI18n } from "@/testing/render";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import OnboardingPhotoScreen from "./onboarding-photo-screen";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href), replace: (href: unknown) => mockReplace(href) },
}));

jest.mock("../hooks/use-lab-card", () => ({
  useLabCard: () => ({
    firstName: "Maya",
    card: {
      title: "Lab card · since Oct 2026",
      fields: [{ label: "Name", value: "Maya Chen" }],
      accessibilityLabel: "Your lab card: Maya Chen, @maya.chen",
    },
  }),
}));

const mockLibraryPermission = jest.fn();
const mockCameraPermission = jest.fn();
const mockLaunchLibrary = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: () => mockLibraryPermission(),
  requestCameraPermissionsAsync: () => mockCameraPermission(),
  launchImageLibraryAsync: (options: unknown) => mockLaunchLibrary(options),
  launchCameraAsync: jest.fn(),
}));

const mockAlert = jest.fn();
jest.mock("react-native/Libraries/Alert/Alert", () => ({
  __esModule: true,
  default: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderStep = () =>
  renderWithI18n(<OnboardingPhotoScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockLibraryPermission.mockResolvedValue({ granted: true });
  mockCameraPermission.mockResolvedValue({ granted: true });
});

test("shows the card waiting for a face, with no way back to the finished steps", async () => {
  await renderStep();
  expect(screen.getByText("Step 3 of 3")).toBeOnTheScreen();
  expect(screen.getByLabelText("Your lab card: Maya Chen, @maya.chen")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Add a face\nto the name." })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeOnTheScreen();
});

test("a chosen photo goes to the crop, uncropped", async () => {
  const user = userEvent.setup();
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://IMG_0042.HEIC", width: 3024, height: 4032 }],
  });
  await renderStep();

  await user.press(screen.getByRole("button", { name: "Choose from library" }));

  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/onboarding/crop",
      params: { uri: "file://IMG_0042.HEIC", width: "3024", height: "4032" },
    }),
  );
  expect(mockLaunchLibrary).toHaveBeenCalledWith({ mediaTypes: ["images"], quality: 1 });
});

test("cancelling the library stays here", async () => {
  const user = userEvent.setup();
  mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });
  await renderStep();
  await user.press(screen.getByRole("button", { name: "Choose from library" }));
  await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
  expect(mockPush).not.toHaveBeenCalled();
});

test("says how to allow the camera when it was refused", async () => {
  const user = userEvent.setup();
  mockCameraPermission.mockResolvedValue({ granted: false });
  await renderStep();
  await user.press(screen.getByRole("button", { name: "Take a photo" }));
  await waitFor(() =>
    expect(mockAlert).toHaveBeenCalledWith(
      "Everglow can’t reach your photos",
      "Allow camera access in Settings to take your photo.",
    ),
  );
});

test("Skip goes to the finished card", async () => {
  const user = userEvent.setup();
  await renderStep();
  await user.press(screen.getByRole("button", { name: "Skip" }));
  expect(mockReplace).toHaveBeenCalledWith("/onboarding/ready");
});
