import { createApiError } from "@/lib/api/errors";
import { I18nProvider } from "@/providers/i18n-provider";
import { act, renderHook } from "@testing-library/react-native";
import { useOnboardingCropScreen } from "./use-onboarding-crop-screen";

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href), back: () => mockBack() },
  useLocalSearchParams: () => ({ uri: "file://IMG_0042.jpg", width: "3000", height: "4000" }),
}));

const mockPrepare = jest.fn();
jest.mock("../lib/avatar-image", () => ({
  prepareAvatarImage: (...args: unknown[]) => mockPrepare(...args),
}));

const mockUpload = jest.fn();
jest.mock("../api/mutations", () => ({
  useSetAvatarMutation: () => ({ mutateAsync: mockUpload, isPending: false }),
}));

const mockAlert = jest.fn();
jest.mock("react-native/Libraries/Alert/Alert", () => ({
  __esModule: true,
  default: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

const image = { uri: "file://prepared.jpg", contentType: "image/jpeg" };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrepare.mockResolvedValue(image);
  mockUpload.mockResolvedValue({});
});

test("crops the framed square, uploads it, then shows the finished card", async () => {
  const { result } = await renderHook(() => useOnboardingCropScreen(), { wrapper: I18nProvider });

  await act(async () => {
    result.current.onPlace({ width: 400, height: 800 }, { scale: 1, x: 0, y: 0 });
    result.current.onUse();
  });

  expect(mockPrepare).toHaveBeenCalledWith(
    { uri: "file://IMG_0042.jpg", width: 3000, height: 4000 },
    { originX: 750, originY: 1250, width: 1500, height: 1500 },
  );
  expect(mockUpload).toHaveBeenCalledWith(image);
  expect(mockReplace).toHaveBeenCalledWith("/onboarding/ready");
});

test("a failed upload says so and stays on the crop", async () => {
  mockUpload.mockRejectedValue(createApiError("slow down", { status: 429, code: "RATE_LIMIT_EXCEEDED" }));
  const { result } = await renderHook(() => useOnboardingCropScreen(), { wrapper: I18nProvider });

  await act(async () => {
    result.current.onPlace({ width: 400, height: 800 }, { scale: 1, x: 0, y: 0 });
    result.current.onUse();
  });

  expect(mockAlert).toHaveBeenCalledWith("Couldn’t add your photo", expect.any(String));
  expect(mockReplace).not.toHaveBeenCalled();
});

test("Cancel goes back to choose another", async () => {
  const { result } = await renderHook(() => useOnboardingCropScreen(), { wrapper: I18nProvider });
  result.current.onCancel();
  expect(mockBack).toHaveBeenCalled();
});
