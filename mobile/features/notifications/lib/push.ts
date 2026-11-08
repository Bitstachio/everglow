import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import i18n from "@/i18n/instance";

/**
 * The Android channels pushes go to, one per kind of notification, matching
 * the 14.9 Notes toggles. The API sends a type's catalogue `channel` as
 * Expo's `channelId`, so ids must match it. Android fixes a channel's
 * importance once the phone has created it: a new importance needs a new id.
 */
export const NOTIFICATION_CHANNELS = [
  // Account notices, and TEST.
  { id: "account", name: "notes.channels.account", importance: Notifications.AndroidImportance.HIGH },
] as const;

export type NotificationChannelId = (typeof NOTIFICATION_CHANNELS)[number]["id"];

/** Channels earlier builds created. Deleting a missing one is harmless. */
const RETIRED_CHANNEL_IDS = ["default"];

export type PushPermission = "granted" | "denied" | "undetermined";

/** The EAS project push tokens are issued for. Null until the app has one (docs/notifications.md §6). */
export const pushProjectId = (): string | null => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
};

/** Where the system stands. Provisional (quiet) delivery on iOS counts as allowed. */
export const readPushPermission = async (): Promise<PushPermission> => {
  const { granted, status, ios } = await Notifications.getPermissionsAsync();
  if (granted || ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
  return status === Notifications.PermissionStatus.DENIED ? "denied" : "undetermined";
};

/** Shows the system prompt. True when the person allowed notifications. */
export const askPushPermission = async (): Promise<boolean> => {
  await ensureAndroidChannels();
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
};

/** Android 13+ asks for permission only once a channel exists. */
export const ensureAndroidChannels = async (): Promise<void> => {
  if (Platform.OS !== "android") return;
  await Promise.all(
    NOTIFICATION_CHANNELS.map(({ id, name, importance }) =>
      Notifications.setNotificationChannelAsync(id, { name: i18n.t(name, { ns: "common" }), importance }),
    ),
  );
  await Promise.all(RETIRED_CHANNEL_IDS.map((id) => Notifications.deleteNotificationChannelAsync(id)));
};

/**
 * The EAS project id when this phone can have a push token: a real device,
 * an app with an EAS project, and notifications allowed. Null otherwise.
 * Never asks for permission.
 */
export const pushProjectIfAllowed = async (): Promise<string | null> => {
  if (!Device.isDevice) return null;
  const projectId = pushProjectId();
  if (!projectId) return null;
  return (await readPushPermission()) === "granted" ? projectId : null;
};

/**
 * This phone's APNs or FCM token. Natively, every fetch also fires the push
 * token listeners, so never call it from one: pass the listener's token on.
 */
export const getDevicePushToken = async (): Promise<Notifications.DevicePushToken> => {
  await ensureAndroidChannels();
  return Notifications.getDevicePushTokenAsync();
};

/** The Expo push token for a device token. Handing it over keeps Expo from fetching (and emitting) it again. */
export const getExpoPushToken = async (
  projectId: string,
  devicePushToken: Notifications.DevicePushToken,
): Promise<string> => {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken });
  return data;
};
