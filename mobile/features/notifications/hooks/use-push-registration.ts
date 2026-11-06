import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { registerThisDevice } from "../lib/device-registration";

/**
 * Registers this phone each time an account is ready on it (launch and
 * sign-in), and again whenever the push token changes. Only where
 * notifications are already allowed: asking is the roll's job (06.6).
 */
export const usePushRegistration = () => {
  const { user, isOnboarded } = useAuth();
  const userId = isOnboarded ? user?.id : undefined;

  useEffect(() => {
    if (!userId) return;
    const register = (token?: string) =>
      registerThisDevice(token).catch(() => {
        // Offline or refused: the next launch registers again.
      });
    void register();
    // The device token changed (rare: a restore, a reinstall of the OS): fetch the Expo token again.
    const subscription = Notifications.addPushTokenListener(() => void register());
    return () => subscription.remove();
  }, [userId]);
};
