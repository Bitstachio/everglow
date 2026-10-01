import { act, renderHook } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { createApiError } from "@/lib/api/errors";
import { useChangeAvatar } from "./use-change-avatar";

const mockSetAvatar = jest.fn();
const mockRemoveAvatar = jest.fn();
const mockPrepare = jest.fn();
const mockRequestLibrary = jest.fn();
const mockRequestCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
let mockAvatarUrl: string | null = null;

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1", details: { name: "Ada", avatarUrl: mockAvatarUrl } } }),
}));
jest.mock("../api/mutations", () => ({
  useSetAvatarMutation: () => ({ mutateAsync: mockSetAvatar, isPending: false }),
  useRemoveAvatarMutation: () => ({ mutateAsync: mockRemoveAvatar, isPending: false }),
}));
jest.mock("../lib/avatar-image", () => ({
  prepareAvatarImage: (...args: unknown[]) => mockPrepare(...args),
}));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestLibrary(),
  requestCameraPermissionsAsync: () => mockRequestCamera(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const heicAsset = { uri: "file://IMG_0001.HEIC", width: 3024, height: 3024, mimeType: "image/heic" };
const prepared = { uri: "file://avatar.jpg", contentType: "image/jpeg" };

/** Opens the photo menu and presses one of its buttons. */
const choose = async (hook: { current: ReturnType<typeof useChangeAvatar> }, text: string) => {
  alert.mockClear();
  await act(async () => {
    hook.current.handleChangeAvatar();
  });
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === text);
  if (!button) throw new Error(`No "${text}" button in ${buttons.map((b) => b.text).join(", ")}`);
  alert.mockClear();
  await act(async () => {
    await button.onPress?.();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAvatarUrl = null;
  mockRequestLibrary.mockResolvedValue({ granted: true });
  mockRequestCamera.mockResolvedValue({ granted: true });
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [heicAsset] });
  mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [heicAsset] });
  mockPrepare.mockResolvedValue(prepared);
  mockSetAvatar.mockResolvedValue({});
  mockRemoveAvatar.mockResolvedValue(undefined);
});

test("a HEIC photo from the library is cropped square, converted, and uploaded", async () => {
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Choose from Library");

  expect(mockLaunchLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }));
  expect(mockPrepare).toHaveBeenCalledWith(heicAsset);
  expect(mockSetAvatar).toHaveBeenCalledWith(prepared);
  expect(alert).not.toHaveBeenCalled();
});

test("a photo can be taken with the camera", async () => {
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Take Photo");
  expect(mockLaunchCamera).toHaveBeenCalled();
  expect(mockSetAvatar).toHaveBeenCalledWith(prepared);
});

test("stops when permission is denied", async () => {
  mockRequestCamera.mockResolvedValue({ granted: false });
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Take Photo");
  expect(mockLaunchCamera).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith("Permission Required", expect.stringContaining("camera"));
});

test("does nothing when the picker is cancelled", async () => {
  mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Choose from Library");
  expect(mockSetAvatar).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test("offers removal only when an avatar is set", async () => {
  const { result, rerender } = await renderHook(() => useChangeAvatar());
  await act(async () => result.current.handleChangeAvatar());
  expect((alert.mock.calls[0][2] as AlertButton[]).map((button) => button.text)).not.toContain("Remove Photo");

  mockAvatarUrl = "https://bucket.example.com/avatars/user-1/a?sig=a";
  await rerender({});
  await choose(result, "Remove Photo");
  expect(mockRemoveAvatar).toHaveBeenCalledTimes(1);
});

test("explains a conflict with another device", async () => {
  mockSetAvatar.mockRejectedValue(createApiError("changed", { status: 409 }));
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Choose from Library");
  expect(alert).toHaveBeenCalledWith("Could not update photo", expect.stringContaining("another device"));
});

test("waits out Retry-After before asking the API again", async () => {
  mockSetAvatar.mockRejectedValue(
    createApiError("slow down", { status: 429, code: "RATE_LIMIT_EXCEEDED", retryAfterSeconds: 30 }),
  );
  const { result } = await renderHook(() => useChangeAvatar());
  await choose(result, "Choose from Library");
  expect(alert).toHaveBeenCalledWith("Too many photo changes", "Please try again in 30 seconds.");

  await choose(result, "Choose from Library");
  expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
  expect(mockSetAvatar).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledWith("Too many photo changes", expect.stringMatching(/try again in \d+ seconds/));
});
