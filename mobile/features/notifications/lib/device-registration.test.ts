import { devicesControllerRegister, devicesControllerUnregister } from "@/lib/api/generated";
import {
  forgetThisDevice,
  isThisDeviceRegistered,
  registerThisDevice,
  resetDeviceRegistration,
  unregisterThisDevice,
} from "./device-registration";
import { getDevicePushToken, getExpoPushToken, pushProjectIfAllowed } from "./push";

const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItem: (key: string) => mockStore.get(key) ?? null,
  setItem: (key: string, value: string) => mockStore.set(key, value),
  deleteItemAsync: (key: string) => Promise.resolve(void mockStore.delete(key)),
}));
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
jest.mock("@/lib/api/generated", () => ({
  devicesControllerRegister: jest.fn(),
  devicesControllerUnregister: jest.fn(),
}));
jest.mock("./push", () => ({
  pushProjectIfAllowed: jest.fn(),
  getDevicePushToken: jest.fn(),
  getExpoPushToken: jest.fn(),
}));

const register = jest.mocked(devicesControllerRegister);
const unregister = jest.mocked(devicesControllerUnregister);
const projectIfAllowed = jest.mocked(pushProjectIfAllowed);
const deviceToken = jest.mocked(getDevicePushToken);
const expoToken = jest.mocked(getExpoPushToken);

const ADA = "ada";
const BEN = "ben";
const DEVICE_ID = "77777777-7777-4777-8777-777777777777";
const APNS = { type: "ios" as const, data: "apns-1" };
const TOKEN = "ExponentPushToken[abc]";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

beforeEach(() => {
  // Each test starts from a phone nobody is signed in on.
  resetDeviceRegistration("signedOut");
  mockStore.clear();
  jest.clearAllMocks();
  projectIfAllowed.mockResolvedValue("project-1");
  deviceToken.mockResolvedValue(APNS);
  expoToken.mockResolvedValue(TOKEN);
  register.mockResolvedValue({ data: { data: { id: DEVICE_ID } } } as never);
  unregister.mockResolvedValue({} as never);
});

describe("registerThisDevice", () => {
  it("registers the Expo token for the device token, and keeps the id for sign-out", async () => {
    await expect(registerThisDevice(ADA)).resolves.toBe(true);

    expect(expoToken).toHaveBeenCalledWith("project-1", APNS);
    expect(register).toHaveBeenCalledWith({
      body: { token: TOKEN, platform: "IOS", locale: "en-CA" },
      throwOnError: true,
    });
    expect(mockStore.get("push.device-id")).toBe(DEVICE_ID);
    expect(isThisDeviceRegistered(ADA)).toBe(true);
  });

  it("does nothing where this phone can't have a token (simulator, no EAS project, not allowed)", async () => {
    projectIfAllowed.mockResolvedValue(null);

    await expect(registerThisDevice(ADA)).resolves.toBe(false);
    expect(deviceToken).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(isThisDeviceRegistered(ADA)).toBe(false);
  });

  it("uses a device token it is handed instead of fetching one", async () => {
    const fcm = { type: "android" as const, data: "fcm-2" };

    await registerThisDevice(ADA, fcm);

    expect(deviceToken).not.toHaveBeenCalled();
    expect(expoToken).toHaveBeenCalledWith("project-1", fcm);
  });

  it("never registers the same device token twice for the account", async () => {
    await registerThisDevice(ADA);
    await expect(registerThisDevice(ADA, APNS)).resolves.toBe(false);
    await expect(registerThisDevice(ADA)).resolves.toBe(false);

    expect(register).toHaveBeenCalledTimes(1);
  });

  it("registers a new device token, and the same one for another account", async () => {
    await registerThisDevice(ADA);
    await registerThisDevice(ADA, { type: "ios", data: "apns-2" });
    resetDeviceRegistration("signedOut");
    await registerThisDevice(BEN, { type: "ios", data: "apns-2" });

    expect(register).toHaveBeenCalledTimes(3);
  });

  it("runs one at a time: a token reported while the first is in flight finds it registered", async () => {
    const put = deferred<unknown>();
    register.mockReturnValueOnce(put.promise as never);

    const first = registerThisDevice(ADA);
    const second = registerThisDevice(ADA, APNS);
    await Promise.resolve();
    put.resolve({ data: { data: { id: DEVICE_ID } } });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("tries again after a request that failed", async () => {
    register.mockRejectedValueOnce(new Error("offline"));

    await expect(registerThisDevice(ADA)).rejects.toThrow("offline");
    await expect(registerThisDevice(ADA, APNS)).resolves.toBe(true);
  });

  it("keeps no id from a request that lands after the account left", async () => {
    const put = deferred<unknown>();
    register.mockReturnValueOnce(put.promise as never);

    const registering = registerThisDevice(ADA);
    await new Promise(setImmediate);
    expect(register).toHaveBeenCalled();
    resetDeviceRegistration("signedOut");
    put.resolve({ data: { data: { id: DEVICE_ID } } });

    await expect(registering).resolves.toBe(false);
    expect(mockStore.has("push.device-id")).toBe(false);
    expect(isThisDeviceRegistered(ADA)).toBe(false);
  });

  it("starts nothing for an account that has gone before its turn came", async () => {
    const put = deferred<unknown>();
    register.mockReturnValueOnce(put.promise as never);
    const first = registerThisDevice(ADA);
    const queued = registerThisDevice(ADA, { type: "ios", data: "apns-2" });
    await new Promise(setImmediate);

    resetDeviceRegistration("sessionExpired");
    put.resolve({ data: { data: { id: DEVICE_ID } } });

    await expect(first).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe("unregisterThisDevice", () => {
  it("removes the registration on the API and forgets it here", async () => {
    mockStore.set("push.device-id", DEVICE_ID);

    await unregisterThisDevice();

    expect(unregister).toHaveBeenCalledWith({ path: { deviceId: DEVICE_ID }, throwOnError: true });
    expect(mockStore.has("push.device-id")).toBe(false);
  });

  it("waits for a registration in flight, so a quick sign-out still removes it", async () => {
    const put = deferred<unknown>();
    register.mockReturnValueOnce(put.promise as never);
    void registerThisDevice(ADA);
    await new Promise(setImmediate);

    const signingOut = unregisterThisDevice();
    put.resolve({ data: { data: { id: DEVICE_ID } } });
    await signingOut;

    expect(unregister).toHaveBeenCalledWith({ path: { deviceId: DEVICE_ID }, throwOnError: true });
    expect(mockStore.has("push.device-id")).toBe(false);
  });

  it("starts no new registration while signing out", async () => {
    const signingOut = unregisterThisDevice();

    await expect(registerThisDevice(ADA)).resolves.toBe(false);
    await signingOut;
    expect(register).not.toHaveBeenCalled();
  });

  it("removes nothing once the account was cleared while it waited", async () => {
    const put = deferred<unknown>();
    register.mockReturnValueOnce(put.promise as never);
    void registerThisDevice(ADA);
    await new Promise(setImmediate);

    const signingOut = unregisterThisDevice();
    // The sign-out gave up waiting, and the session is gone.
    resetDeviceRegistration("signedOut");
    put.resolve({ data: { data: { id: DEVICE_ID } } });
    await signingOut;

    expect(unregister).not.toHaveBeenCalled();
    expect(mockStore.has("push.device-id")).toBe(false);
  });

  it("forgets it here even when the API can't be reached", async () => {
    mockStore.set("push.device-id", DEVICE_ID);
    unregister.mockRejectedValue(new Error("offline"));

    await expect(unregisterThisDevice()).rejects.toThrow("offline");
    expect(mockStore.has("push.device-id")).toBe(false);
  });

  it("makes no request when this phone was never registered", async () => {
    await unregisterThisDevice();

    expect(unregister).not.toHaveBeenCalled();
  });
});

describe("resetDeviceRegistration", () => {
  it("opens registration again for the next account", async () => {
    void unregisterThisDevice();
    resetDeviceRegistration("signedOut");

    await expect(registerThisDevice(BEN)).resolves.toBe(true);
  });

  it("keeps the stored id when the session only expired: the same person signs back in", () => {
    mockStore.set("push.device-id", DEVICE_ID);

    resetDeviceRegistration("sessionExpired");

    expect(mockStore.get("push.device-id")).toBe(DEVICE_ID);
  });
});

describe("forgetThisDevice", () => {
  it("drops the stored id", () => {
    mockStore.set("push.device-id", DEVICE_ID);

    forgetThisDevice();

    expect(mockStore.has("push.device-id")).toBe(false);
  });
});
