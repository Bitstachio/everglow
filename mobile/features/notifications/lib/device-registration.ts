import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { devicesControllerRegister, devicesControllerUnregister } from "@/lib/api/generated";
import { getPushToken } from "./push";

/**
 * The id the API gave this phone's registration, kept so sign-out can remove
 * it (docs/notifications.md §2). The token itself is not kept: Expo hands it
 * out again on demand.
 */
const DEVICE_ID_KEY = "push.device-id";

const readDeviceId = (): string | null => {
  try {
    return SecureStore.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
};

const storeDeviceId = (id: string): void => {
  try {
    SecureStore.setItem(DEVICE_ID_KEY, id);
  } catch {
    // Keychain unavailable: sign-out can't unregister, and the next sign-in on this phone takes the token over.
  }
};

/** Forget this phone's registration locally. The API side goes with the account, or moves on the next sign-in. */
export const forgetThisDevice = (): void => {
  try {
    void SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  } catch {
    // Nothing stored.
  }
};

/**
 * Registers this phone for the signed-in account, when it can have a push
 * token. Safe to call on every launch: the API keeps one row per token.
 * False when there was nothing to register.
 */
export const registerThisDevice = async (token?: string): Promise<boolean> => {
  const pushToken = token ?? (await getPushToken());
  if (!pushToken) return false;

  const { data } = await devicesControllerRegister({
    body: {
      token: pushToken,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
      locale: getLocales()[0]?.languageTag,
    },
    throwOnError: true,
  });
  storeDeviceId(unwrapEnvelope(data).id);
  return true;
};

/** On sign-out, while the access token still works: no more pushes for this account on this phone. */
export const unregisterThisDevice = async (): Promise<void> => {
  const deviceId = readDeviceId();
  if (!deviceId) return;
  try {
    await devicesControllerUnregister({ path: { deviceId }, throwOnError: true });
  } finally {
    forgetThisDevice();
  }
};
