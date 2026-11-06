import { devicesControllerRegister, devicesControllerUnregister } from "@/lib/api/generated";
import { forgetThisDevice, registerThisDevice, unregisterThisDevice } from "./device-registration";
import { getPushToken } from "./push";

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
jest.mock("./push", () => ({ getPushToken: jest.fn() }));

const register = jest.mocked(devicesControllerRegister);
const unregister = jest.mocked(devicesControllerUnregister);
const pushToken = jest.mocked(getPushToken);

const DEVICE_ID = "77777777-7777-4777-8777-777777777777";
const TOKEN = "ExponentPushToken[abc]";

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  register.mockResolvedValue({ data: { data: { id: DEVICE_ID } } } as never);
  unregister.mockResolvedValue({} as never);
});

describe("registerThisDevice", () => {
  it("registers the token with the platform and locale, and keeps the id for sign-out", async () => {
    pushToken.mockResolvedValue(TOKEN);

    await expect(registerThisDevice()).resolves.toBe(true);

    expect(register).toHaveBeenCalledWith({
      body: { token: TOKEN, platform: "IOS", locale: "en-CA" },
      throwOnError: true,
    });
    expect(mockStore.get("push.device-id")).toBe(DEVICE_ID);
  });

  it("does nothing where this phone has no token (simulator, no EAS project, not allowed)", async () => {
    pushToken.mockResolvedValue(null);

    await expect(registerThisDevice()).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("uses a token it is handed instead of asking Expo again", async () => {
    await registerThisDevice("ExponentPushToken[new]");

    expect(pushToken).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ token: "ExponentPushToken[new]" }) }),
    );
  });
});

describe("unregisterThisDevice", () => {
  it("removes the registration on the API and forgets it here", async () => {
    mockStore.set("push.device-id", DEVICE_ID);

    await unregisterThisDevice();

    expect(unregister).toHaveBeenCalledWith({ path: { deviceId: DEVICE_ID }, throwOnError: true });
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

describe("forgetThisDevice", () => {
  it("drops the stored id", () => {
    mockStore.set("push.device-id", DEVICE_ID);

    forgetThisDevice();

    expect(mockStore.has("push.device-id")).toBe(false);
  });
});
