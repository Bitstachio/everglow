import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import i18n from "@/i18n/instance";

/** The Android channel every push goes to. Must match NOTIFICATION_ANDROID_CHANNEL_ID in the API. */
export const ANDROID_CHANNEL_ID = "default";

export type PushPermission = "granted" | "denied" | "undetermined";

/** The EAS project push tokens are issued for. Null until the app has one (docs/notifications.md §6). */
export const pushProjectId = (): string | null => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
};

export const readPushPermission = async (): Promise<PushPermission> => {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushPermission;
};

/** Shows the system prompt (06.6). True when the person allowed notifications. */
export const askPushPermission = async (): Promise<boolean> => {
  await ensureAndroidChannel();
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
};

/** Android 13+ asks for permission only once a channel exists. */
const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: i18n.t("notes.channel", { ns: "common" }),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
};

/**
 * This phone's Expo push token, or null where it can't have one: a
 * simulator, an app without an EAS project yet, or notifications not allowed.
 * Never asks for permission.
 */
export const getPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) return null;
  const projectId = pushProjectId();
  if (!projectId) return null;
  if ((await readPushPermission()) !== "granted") return null;
  await ensureAndroidChannel();
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
};
