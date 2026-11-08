import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/auth-context";
import { isThisDeviceRegistered, registerThisDevice } from "../lib/device-registration";
import { onNotificationPermissionGranted } from "../lib/notification-permission";

/**
 * Registers this phone each time an account is ready on it (launch and
 * sign-in), when the push token changes, and when notifications become
 * allowed: from the app's own prompt, or in the system settings while the
 * app was away. Only where notifications are allowed: asking is the roll's
 * job (06.6).
 */
export const usePushRegistration = () => {
  const { user, isOnboarded } = useAuth();
  const userId = isOnboarded ? user?.id : undefined;

  useEffect(() => {
    if (!userId) return;
    const register = (devicePushToken?: Notifications.DevicePushToken) => {
      registerThisDevice(userId, devicePushToken).catch(() => {
        // Offline or refused: coming back to the app, or the next launch, registers again.
      });
    };
    register();
    // The device token changed (a restore, a reinstall of the OS), or a fetch above reported it.
    // Use the token handed over: fetching it again here would fire this listener again.
    const tokens = Notifications.addPushTokenListener((devicePushToken) => register(devicePushToken));
    const granted = onNotificationPermissionGranted(() => register());
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isThisDeviceRegistered(userId)) register();
    });
    return () => {
      tokens.remove();
      granted();
      appState.remove();
    };
  }, [userId]);
};
