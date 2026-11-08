import * as Notifications from "expo-notifications";
import type { Href } from "expo-router";
import { notificationRoute } from "./notification-route";

/**
 * Taps already handled, by the API's `notificationId` (or the system's id
 * when there is none), so one notification opens once whether it reached the
 * app at launch or while it was running.
 */
const handled = new Set<string>();

const tapKey = ({ notification }: Notifications.NotificationResponse): string => {
  const { identifier, content } = notification.request;
  const id = (content.data as { notificationId?: unknown } | null)?.notificationId;
  return typeof id === "string" && id ? id : identifier;
};

/** Where a tap opens, once per notification. Null for a tap already handled, an action button, or no known screen. */
export const takeTap = (response: Notifications.NotificationResponse): Href | null => {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const key = tapKey(response);
  if (handled.has(key)) return null;
  handled.add(key);
  return notificationRoute(response.notification.request.content.data);
};

/** Done with the last tap, so it doesn't come back. */
export const clearLastTap = (): void => {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Not available here (web): nothing is kept.
  }
};

/** The account left this phone: a tap it hadn't opened yet never opens for the next one. */
export const forgetTaps = (): void => {
  handled.clear();
  clearLastTap();
};
