import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert, type AlertButton } from "react-native";
import { useNewRollCover } from "./use-new-roll-cover";

const mockPrepare = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("../lib/cover-image", () => ({
  COVER_ASPECT: [16, 9],
  prepareCoverImage: (...args: unknown[]) => mockPrepare(...args),
}));

const picker = jest.mocked(ImagePicker);
const asset = { uri: "file://picked.heic", width: 4032, height: 3024 };
const prepared = { uri: "file://cover.jpg", contentType: "image/jpeg" as const };
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

/** Opens the cover menu and presses one of its buttons. */
const choose = async (onPickCover: () => void, text: string) => {
  alert.mockClear();
  onPickCover();
  const buttons = (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
  await act(async () => {
    buttons.find((button) => button.text === text)?.onPress?.();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] } as never);
  picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as never);
  mockPrepare.mockResolvedValue(prepared);
});

test("crops a photo from the library into the first frame, then can remove it", async () => {
  const { result } = await renderHook(() => useNewRollCover(), { wrapper: I18nProvider });
  expect(result.current.cover).toBeNull();

  await choose(result.current.onPickCover, "Choose from Photos");
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ aspect: [16, 9] }));
  expect(mockPrepare).toHaveBeenCalledWith(asset);
  expect(result.current.cover).toEqual(prepared);

  await choose(result.current.onPickCover, "Remove it");
  expect(result.current.cover).toBeNull();
});

test("takes a photo with the camera", async () => {
  const { result } = await renderHook(() => useNewRollCover(), { wrapper: I18nProvider });
  await choose(result.current.onPickCover, "Take a photo");
  expect(picker.launchCameraAsync).toHaveBeenCalled();
  expect(result.current.cover).toEqual(prepared);
});

test("says how to allow access, and leaves the frame empty when cancelled", async () => {
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
  const { result } = await renderHook(() => useNewRollCover(), { wrapper: I18nProvider });

  await choose(result.current.onPickCover, "Choose from Photos");
  expect(alert).toHaveBeenLastCalledWith("No access", "Allow access to Photos in Settings to choose a cover.");
  expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();

  picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null } as never);
  await choose(result.current.onPickCover, "Choose from Photos");
  expect(result.current.cover).toBeNull();
});

test("says so when the photo can't be used", async () => {
  mockPrepare.mockRejectedValueOnce(new Error("decode failed"));
  const { result } = await renderHook(() => useNewRollCover(), { wrapper: I18nProvider });

  await choose(result.current.onPickCover, "Choose from Photos");
  expect(alert).toHaveBeenLastCalledWith("Couldn’t use that photo. Try another.");
  expect(result.current.cover).toBeNull();
  expect(result.current.isPreparing).toBe(false);
});
