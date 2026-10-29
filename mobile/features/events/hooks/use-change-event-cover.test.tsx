import { act, renderHook } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { createApiError } from "@/lib/api/errors";
import { useChangeEventCover } from "./use-change-event-cover";

const mockSetCover = jest.fn();
const mockRemoveCover = jest.fn();
const mockPrepare = jest.fn();
const mockRequestLibrary = jest.fn();
const mockRequestCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockLaunchCamera = jest.fn();

jest.mock("../api/mutations", () => ({
  useSetEventCoverMutation: () => ({ mutateAsync: mockSetCover, isPending: false }),
  useRemoveEventCoverMutation: () => ({ mutateAsync: mockRemoveCover, isPending: false }),
}));
jest.mock("../lib/cover-image", () => ({
  prepareCoverImage: (...args: unknown[]) => mockPrepare(...args),
}));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestLibrary(),
  requestCameraPermissionsAsync: () => mockRequestCamera(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const heicAsset = { uri: "file://IMG_0001.HEIC", width: 4032, height: 3024, mimeType: "image/heic" };
const prepared = { uri: "file://cover.jpg", contentType: "image/jpeg" };
const picked = { uri: heicAsset.uri, width: heicAsset.width, height: heicAsset.height };
const frame = { originX: 0, originY: 378, width: 4032, height: 2268 };

const menuButtons = async (hook: { current: ReturnType<typeof useChangeEventCover> }) => {
  alert.mockClear();
  await act(async () => {
    hook.current.handleChangeCover();
  });
  return alert.mock.calls[0][2] as AlertButton[];
};

/** Opens the cover menu and presses one of its buttons. */
const choose = async (hook: { current: ReturnType<typeof useChangeEventCover> }, text: string) => {
  const buttons = await menuButtons(hook);
  const button = buttons.find((candidate) => candidate.text === text);
  if (!button) throw new Error(`No "${text}" button in ${buttons.map((b) => b.text).join(", ")}`);
  alert.mockClear();
  await act(async () => {
    await button.onPress?.();
  });
};

/** Uses the photo in the cover crop as framed. */
const useFrame = async (hook: { current: ReturnType<typeof useChangeEventCover> }) => {
  await act(async () => hook.current.coverCrop.onUse(frame));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestLibrary.mockResolvedValue({ granted: true });
  mockRequestCamera.mockResolvedValue({ granted: true });
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [heicAsset] });
  mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [heicAsset] });
  mockPrepare.mockResolvedValue(prepared);
  mockSetCover.mockResolvedValue({});
  mockRemoveCover.mockResolvedValue(undefined);
});

test("frames a library photo at 16:9, prepares it and uploads the result", async () => {
  const { result } = await renderHook(() => useChangeEventCover("event-1", false));

  await choose(result, "Choose from Library");
  // iOS's editor only crops square, so the picker leaves the photo whole for the cover crop.
  expect(mockLaunchLibrary).toHaveBeenCalledWith(expect.not.objectContaining({ allowsEditing: true }));
  expect(result.current.coverCrop.photo).toEqual(picked);
  expect(mockSetCover).not.toHaveBeenCalled();

  await useFrame(result);
  expect(result.current.coverCrop.photo).toBeNull();
  expect(mockPrepare).toHaveBeenCalledWith(picked, frame);
  expect(mockSetCover).toHaveBeenCalledWith(prepared);
  expect(alert).not.toHaveBeenCalled();
});

test("uploads nothing when the crop is cancelled", async () => {
  const { result } = await renderHook(() => useChangeEventCover("event-1", false));

  await choose(result, "Choose from Library");
  await act(async () => result.current.coverCrop.onCancel());

  expect(result.current.coverCrop.photo).toBeNull();
  expect(mockSetCover).not.toHaveBeenCalled();
});

test("offers Remove Cover only when the event has one", async () => {
  const withoutCover = await renderHook(() => useChangeEventCover("event-1", false));
  expect((await menuButtons(withoutCover.result)).map((b) => b.text)).not.toContain("Remove Cover");

  const withCover = await renderHook(() => useChangeEventCover("event-1", true));
  await choose(withCover.result, "Remove Cover");
  expect(mockRemoveCover).toHaveBeenCalled();
});

test("asks for camera permission and stops when it is denied", async () => {
  mockRequestCamera.mockResolvedValue({ granted: false });
  const { result } = await renderHook(() => useChangeEventCover("event-1", false));

  await choose(result, "Take Photo");

  expect(mockLaunchCamera).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith("Permission Required", expect.stringContaining("camera"));
});

test("explains a conflict with another host", async () => {
  mockSetCover.mockRejectedValue(
    createApiError("Another host changed the cover at the same time. Please try again.", {
      status: 409,
      code: "COVER_CHANGED_CONCURRENTLY",
    }),
  );
  const { result } = await renderHook(() => useChangeEventCover("event-1", false));

  await choose(result, "Choose from Library");
  await useFrame(result);

  expect(alert).toHaveBeenCalledWith("Could not update cover", expect.stringContaining("Another host"));
});

test("backs off for Retry-After after a 429", async () => {
  mockSetCover.mockRejectedValue(
    createApiError("slow down", { status: 429, code: "RATE_LIMIT_EXCEEDED", retryAfterSeconds: 30 }),
  );
  const { result } = await renderHook(() => useChangeEventCover("event-1", false));

  await choose(result, "Choose from Library");
  await useFrame(result);
  expect(alert).toHaveBeenCalledWith("Too many cover changes", "Please try again in 30 seconds.");

  mockLaunchLibrary.mockClear();
  await choose(result, "Choose from Library");
  expect(mockLaunchLibrary).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith(
    "Too many cover changes",
    expect.stringMatching(/^Please try again in \d+ seconds\.$/),
  );
});
