import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { clearLastTap, takeTap } from "../lib/notification-taps";

/** Past the launch redirect, and outside sign-in, onboarding and the leaving screens. */
const isSettledPath = (pathname: string) =>
  pathname !== "/" &&
  pathname !== "/login" &&
  pathname !== "/account-deleted" &&
  pathname !== "/account-suspended" &&
  pathname !== "/onboarding" &&
  !pathname.startsWith("/onboarding/");

/**
 * Opens what a tapped notification is about, whether it woke the app or
 * reached it running. Waits until an account is signed in and onboarded and
 * the launch redirect has landed outside sign-in and onboarding, so the
 * screen opens on top of Home and Back goes there.
 */
export const useNotificationTaps = () => {
  const { isAuthenticated, isOnboarded, isSuspended } = useAuth();
  const pathname = usePathname();
  const ready = isAuthenticated && isOnboarded && !isSuspended && isSettledPath(pathname);
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ready || !response) return;
    const route = takeTap(response);
    clearLastTap();
    if (route) router.push(route);
  }, [ready, response]);
};
