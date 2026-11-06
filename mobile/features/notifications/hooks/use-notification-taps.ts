import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { notificationRoute } from "../lib/notification-route";

/**
 * Opens what a tapped notification is about, whether it woke the app or
 * reached it running. Waits until an account is ready and the launch redirect
 * has landed, so the screen opens on top of Home and Back goes there.
 */
export const useNotificationTaps = () => {
  const { isAuthenticated, isOnboarded, isSuspended } = useAuth();
  const ready = isAuthenticated && isOnboarded && !isSuspended;
  const pathname = usePathname();
  const settled = pathname !== "/";
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !settled || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    if (handled.current === identifier) return;
    handled.current = identifier;
    Notifications.clearLastNotificationResponse();

    const route = notificationRoute(content.data);
    if (route && route !== "/") router.push(route);
  }, [ready, settled, response]);
};
