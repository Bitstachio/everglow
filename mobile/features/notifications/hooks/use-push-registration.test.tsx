import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { resetDeviceRegistration } from "../lib/device-registration";
import { requestNotificationPermission } from "../lib/notification-permission";
import { usePushRegistration } from "./use-push-registration";

type DeviceToken = { type: "ios"; data: string };

const mockTokenListeners = new Set<(token: DeviceToken) => void>();
let mockDeviceToken: DeviceToken = { type: "ios", data: "apns-1" };
let mockPermission = { granted: true, status: "granted" };
let mockAuth: { user: { id: string } | null; isOnboarded: boolean } = { user: { id: "ada" }, isOnboarded: true };

/** Like the native module: every device-token fetch also reports the token to the listeners, a moment later. */
const mockFetchDeviceToken = jest.fn(() => {
  const token = mockDeviceToken;
  setTimeout(() => mockTokenListeners.forEach((listener) => listener(token)), 0);
  return Promise.resolve(token);
});

jest.mock("expo-notifications", () => ({
  addPushTokenListener: (listener: (token: DeviceToken) => void) => {
    mockTokenListeners.add(listener);
    return { remove: () => mockTokenListeners.delete(listener) };
  },
  getDevicePushTokenAsync: () => mockFetchDeviceToken(),
  // Without a device token, Expo fetches one itself, which reports it again.
  getExpoPushTokenAsync: async ({ devicePushToken }: { devicePushToken?: DeviceToken }) => {
    const device = devicePushToken ?? (await mockFetchDeviceToken());
    return { type: "expo", data: `ExponentPushToken[${device.data}]` };
  },
  getPermissionsAsync: () => Promise.resolve(mockPermission),
  requestPermissionsAsync: () => {
    mockPermission = { granted: true, status: "granted" };
    return Promise.resolve(mockPermission);
  },
  setNotificationChannelAsync: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  PermissionStatus: { DENIED: "denied", GRANTED: "granted", UNDETERMINED: "undetermined" },
}));
jest.mock("expo-device", () => ({ __esModule: true, isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
jest.mock("expo-secure-store", () => ({
  getItem: () => null,
  setItem: jest.fn(),
  deleteItemAsync: () => Promise.resolve(),
}));
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
jest.mock("@/lib/api/generated", () => ({
  devicesControllerRegister: jest.fn(),
  devicesControllerUnregister: jest.fn(),
}));
jest.mock("@/context/auth-context", () => ({ useAuth: () => mockAuth }));

// Required rather than imported: only the real lib may import the generated client.
const register = jest.requireMock<{ devicesControllerRegister: jest.Mock }>(
  "@/lib/api/generated",
).devicesControllerRegister;
const device = jest.requireMock<{ isDevice: boolean }>("expo-device");
const tokensSent = () => register.mock.calls.map(([options]) => options.body.token);

let appStateListener: ((state: AppStateStatus) => void) | null = null;
let appStateSpy: jest.SpyInstance;

/** Many turns of the event loop: enough for a loop to show itself. */
const flush = async (ticks = 50) => {
  for (let tick = 0; tick < ticks; tick += 1) {
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }
};

beforeEach(() => {
  resetDeviceRegistration("signedOut");
  jest.clearAllMocks();
  mockTokenListeners.clear();
  mockDeviceToken = { type: "ios", data: "apns-1" };
  mockPermission = { granted: true, status: "granted" };
  device.isDevice = true;
  mockAuth = { user: { id: "ada" }, isOnboarded: true };
  register.mockResolvedValue({ data: { data: { id: "device-1" } } } as never);
  appStateSpy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return {
      remove: () => {
        appStateListener = null;
      },
    } as never;
  });
});

afterEach(() => {
  appStateSpy.mockRestore();
});

const renderRegistration = () => renderHook(() => usePushRegistration());

test("registers once at launch, and the token the fetch reports back doesn't register it again", async () => {
  await renderRegistration();
  await flush();

  expect(tokensSent()).toEqual(["ExponentPushToken[apns-1]"]);
  expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
});

test("a token that keeps being reported never loops", async () => {
  await renderRegistration();
  await flush(5);

  for (let report = 0; report < 20; report += 1) {
    await act(async () => {
      mockTokenListeners.forEach((listener) => listener(mockDeviceToken));
    });
  }
  await flush();

  expect(register).toHaveBeenCalledTimes(1);
  expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
});

test("a new device token registers once, without fetching it again", async () => {
  await renderRegistration();
  await flush(5);

  mockDeviceToken = { type: "ios", data: "apns-2" };
  await act(async () => {
    mockTokenListeners.forEach((listener) => listener(mockDeviceToken));
  });
  await flush();

  expect(tokensSent()).toEqual(["ExponentPushToken[apns-1]", "ExponentPushToken[apns-2]"]);
  expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
});

test("registers again for the next account on this phone", async () => {
  const { rerender } = await renderRegistration();
  await flush(5);

  mockAuth = { user: null, isOnboarded: false };
  await rerender({});
  resetDeviceRegistration("signedOut");
  mockAuth = { user: { id: "ben" }, isOnboarded: true };
  await rerender({});
  await flush();

  expect(register).toHaveBeenCalledTimes(2);
});

test("registers nothing before onboarding is done", async () => {
  mockAuth = { user: { id: "ada" }, isOnboarded: false };

  await renderRegistration();
  await flush(5);

  expect(register).not.toHaveBeenCalled();
});

test.each([
  ["notifications are not allowed", () => (mockPermission = { granted: false, status: "denied" })],
  ["the system hasn't asked yet", () => (mockPermission = { granted: false, status: "undetermined" })],
  ["it runs on a simulator", () => (device.isDevice = false)],
])("registers nothing when %s", async (_label, arrange) => {
  arrange();

  await renderRegistration();
  await flush(5);

  expect(mockFetchDeviceToken).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});

test("registers on coming back to the app after notifications were turned on in Settings", async () => {
  mockPermission = { granted: false, status: "denied" };
  await renderRegistration();
  await flush(5);
  expect(register).not.toHaveBeenCalled();

  mockPermission = { granted: true, status: "granted" };
  await act(async () => {
    appStateListener?.("active");
  });
  await flush();

  expect(register).toHaveBeenCalledTimes(1);
});

test("coming back to the app once registered checks nothing again", async () => {
  await renderRegistration();
  await flush(5);

  await act(async () => {
    appStateListener?.("active");
  });
  await flush(5);

  expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledTimes(1);
});

test("registers as soon as the person allows notifications in the app", async () => {
  mockPermission = { granted: false, status: "undetermined" };
  await renderRegistration();
  await flush(5);

  await act(async () => {
    await requestNotificationPermission();
  });
  await flush();

  expect(register).toHaveBeenCalledTimes(1);
});

test("stops listening once the account leaves", async () => {
  const { unmount } = await renderRegistration();
  await flush(5);

  await unmount();

  expect(mockTokenListeners.size).toBe(0);
  expect(appStateListener).toBeNull();
});
