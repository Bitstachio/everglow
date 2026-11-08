import { getLocales } from "expo-localization";
import type { DevicePushToken } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { AccountClearedReason } from "@/lib/account-cleared";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { devicesControllerRegister, devicesControllerUnregister } from "@/lib/api/generated";
import { getDevicePushToken, getExpoPushToken, pushProjectIfAllowed } from "./push";

/**
 * The id the API gave this phone's registration, kept so sign-out can remove
 * it (docs/notifications.md §2). The token itself is not kept: Expo hands it
 * out again on demand.
 */
const DEVICE_ID_KEY = "push.device-id";

/**
 * Registration state for the account on this phone, in memory.
 *
 * - `generation` moves on whenever the account is cleared, so a request that
 *   lands after sign-out or for a previous account stores nothing.
 * - `queue` runs registrations one at a time: a token listener that fires
 *   while the launch registration is in flight waits for it, then finds the
 *   token already registered.
 * - `registered` is the account and device token the API last accepted, so
 *   the same token never registers twice in a session.
 * - `closing` is set by sign-out: nothing new starts while it waits for the
 *   request in flight.
 */
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
let registered: { userId: string; deviceToken: string } | null = null;
let closing = false;

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

const deviceTokenKey = ({ data }: DevicePushToken): string => (typeof data === "string" ? data : JSON.stringify(data));

const isRegistered = (userId: string, deviceToken: string) =>
  registered?.userId === userId && registered.deviceToken === deviceToken;

/** Whether this session already registered this phone for the account. */
export const isThisDeviceRegistered = (userId: string): boolean => registered?.userId === userId;

const register = async (userId: string, at: number, given?: DevicePushToken): Promise<boolean> => {
  const current = () => at === generation;
  if (!current() || (given && isRegistered(userId, deviceTokenKey(given)))) return false;

  const projectId = await pushProjectIfAllowed();
  if (!projectId || !current()) return false;
  // A fresh fetch fires the token listeners; they queue behind this and find it registered.
  const devicePushToken = given ?? (await getDevicePushToken());
  const deviceToken = deviceTokenKey(devicePushToken);
  if (!current() || isRegistered(userId, deviceToken)) return false;

  const token = await getExpoPushToken(projectId, devicePushToken);
  if (!current()) return false;
  const { data } = await devicesControllerRegister({
    body: {
      token,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
      locale: getLocales()[0]?.languageTag,
    },
    throwOnError: true,
  });
  // Signed out, or another account, while the request was out: the id isn't this session's to keep.
  if (!current()) return false;
  storeDeviceId(unwrapEnvelope(data).id);
  registered = { userId, deviceToken };
  return true;
};

/**
 * Registers this phone for the signed-in account, when it can have a push
 * token. Safe to call on every launch: the API keeps one row per token, and
 * a token this session already registered is skipped. `devicePushToken` is
 * the one a token listener was handed. False when nothing was registered.
 */
export const registerThisDevice = (userId: string, devicePushToken?: DevicePushToken): Promise<boolean> => {
  if (closing) return Promise.resolve(false);
  const at = generation;
  const job = queue.then(() => register(userId, at, devicePushToken));
  queue = job.catch(() => undefined);
  return job;
};

/**
 * On sign-out, while the access token still works: no more pushes for this
 * account on this phone. Waits for a registration in flight first, so its id
 * is there to remove. The caller bounds the wait (lib/before-sign-out.ts).
 */
export const unregisterThisDevice = async (): Promise<void> => {
  closing = true;
  const at = generation;
  await queue;
  // Gave up waiting and the account was cleared meanwhile: the token is gone.
  if (at !== generation) return;
  const deviceId = readDeviceId();
  if (!deviceId) return;
  try {
    await devicesControllerUnregister({ path: { deviceId }, throwOnError: true });
  } finally {
    forgetThisDevice();
  }
};

/** The account left this phone: whatever is in flight is for nobody now. */
export const resetDeviceRegistration = (reason: AccountClearedReason): void => {
  generation += 1;
  registered = null;
  closing = false;
  if (reason === "signedOut") forgetThisDevice();
};
