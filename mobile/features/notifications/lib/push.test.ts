import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  askPushPermission,
  ensureAndroidChannels,
  getDevicePushToken,
  getExpoPushToken,
  pushProjectIfAllowed,
  readPushPermission,
} from "./push";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3 },
  PermissionStatus: { DENIED: "denied", GRANTED: "granted", UNDETERMINED: "undetermined" },
}));
jest.mock("expo-device", () => ({ __esModule: true, isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: null, easConfig: null } }));

type Config = { extra?: { eas?: { projectId?: string } } } | null;
const device = jest.requireMock<{ isDevice: boolean }>("expo-device");
const constants = jest.requireMock<{ default: { expoConfig: Config; easConfig: { projectId?: string } | null } }>(
  "expo-constants",
).default;

const permissions = jest.mocked(Notifications.getPermissionsAsync);
const request = jest.mocked(Notifications.requestPermissionsAsync);
const setChannel = jest.mocked(Notifications.setNotificationChannelAsync);
const deleteChannel = jest.mocked(Notifications.deleteNotificationChannelAsync);

const status = (granted: boolean, value: string, ios?: { status: number }) =>
  ({ granted, status: value, ios, canAskAgain: true, expires: "never" }) as never;

const originalOS = Platform.OS;
const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, "OS", { value: os, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  device.isDevice = true;
  constants.expoConfig = { extra: { eas: { projectId: "project-1" } } };
  constants.easConfig = null;
  permissions.mockResolvedValue(status(true, "granted"));
  setOS("ios");
});

afterAll(() => setOS(originalOS));

describe("readPushPermission", () => {
  it.each([
    ["granted", status(true, "granted"), "granted"],
    ["iOS provisional delivery", status(false, "undetermined", { status: 3 }), "granted"],
    ["denied", status(false, "denied", { status: 1 }), "denied"],
    ["never asked", status(false, "undetermined", { status: 0 }), "undetermined"],
  ])("reads %s", async (_label, response, permission) => {
    permissions.mockResolvedValue(response);

    await expect(readPushPermission()).resolves.toBe(permission);
  });
});

describe("pushProjectIfAllowed", () => {
  it("gives the EAS project on a real device that allows notifications", async () => {
    await expect(pushProjectIfAllowed()).resolves.toBe("project-1");
  });

  it("falls back to the EAS build's project id", async () => {
    constants.expoConfig = {};
    constants.easConfig = { projectId: "project-2" };

    await expect(pushProjectIfAllowed()).resolves.toBe("project-2");
  });

  it("is null on a simulator, without asking anything", async () => {
    device.isDevice = false;

    await expect(pushProjectIfAllowed()).resolves.toBeNull();
    expect(permissions).not.toHaveBeenCalled();
  });

  it("is null for an app without an EAS project", async () => {
    constants.expoConfig = null;

    await expect(pushProjectIfAllowed()).resolves.toBeNull();
  });

  it("is null where notifications are not allowed", async () => {
    permissions.mockResolvedValue(status(false, "denied"));

    await expect(pushProjectIfAllowed()).resolves.toBeNull();
  });
});

describe("Android channels", () => {
  it("creates one channel per kind at high importance, and drops the old default one", async () => {
    setOS("android");

    await ensureAndroidChannels();

    expect(setChannel).toHaveBeenCalledTimes(2);
    expect(setChannel).toHaveBeenCalledWith("account", { name: "Account", importance: 4 });
    expect(setChannel).toHaveBeenCalledWith("roll_closing", {
      name: "The day before it closes",
      importance: 4,
    });
    expect(deleteChannel).toHaveBeenCalledWith("default");
  });

  it("creates them before the system prompt", async () => {
    setOS("android");
    request.mockResolvedValue(status(true, "granted"));

    await expect(askPushPermission()).resolves.toBe(true);

    expect(setChannel.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
  });

  it("creates nothing on iOS", async () => {
    await ensureAndroidChannels();

    expect(setChannel).not.toHaveBeenCalled();
  });
});

describe("tokens", () => {
  it("hands the device token to Expo so it isn't fetched again", async () => {
    const device = { type: "ios" as const, data: "apns-1" };
    jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue(device);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ type: "expo", data: "ExponentPushToken[x]" });

    const token = await getDevicePushToken();

    await expect(getExpoPushToken("project-1", token)).resolves.toBe("ExponentPushToken[x]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: "project-1",
      devicePushToken: device,
    });
  });
});
