import type * as Notifications from "expo-notifications";
import { notificationRoute, rollIdOf } from "./notification-route";

/** The path on screen, kept by the notifications provider. */
let openPath: string | null = null;

export const setOpenPath = (path: string | null): void => {
  openPath = path;
};

/**
 * A notification that arrives while the app is open: a quiet banner, and
 * always an entry in the list. No banner about the roll already on screen.
 */
export const foregroundBehavior = (notification: Notifications.Notification): Notifications.NotificationBehavior => {
  const route = notificationRoute(notification.request.content.data);
  const roll = rollIdOf(typeof route === "string" ? route : null);
  const onIt = roll !== null && roll === rollIdOf(openPath);
  return { shouldShowBanner: !onIt, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
};
