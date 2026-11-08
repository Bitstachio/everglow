import { usePathname } from "expo-router";
import { useEffect } from "react";
import { useNotificationTaps } from "../hooks/use-notification-taps";
import { usePushRegistration } from "../hooks/use-push-registration";
import { setOpenPath } from "../lib/foreground";
import { setUpNotifications } from "../lib/set-up-notifications";

/** Push for the signed-in account: registering this phone, and opening what a tap is about (docs/notifications.md). */
export const NotificationsProvider = () => {
  const pathname = usePathname();
  useEffect(() => setUpNotifications(), []);
  useEffect(() => setOpenPath(pathname), [pathname]);
  usePushRegistration();
  useNotificationTaps();
  return null;
};
