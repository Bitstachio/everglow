import * as Notifications from "expo-notifications";
import { onAccountCleared } from "@/lib/account-cleared";
import { onBeforeSignOut } from "@/lib/before-sign-out";
import { forgetThisDevice, unregisterThisDevice } from "../lib/device-registration";
import { useNotificationTaps } from "../hooks/use-notification-taps";
import { usePushRegistration } from "../hooks/use-push-registration";

// A notification that arrives while the app is open shows as a banner, quietly.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// A deleted account's phones went with it on the API; anything else unregisters while it still can.
onBeforeSignOut(({ accountDeleted }) => (accountDeleted ? Promise.resolve() : unregisterThisDevice()));
// Whatever happened, the next account on this phone starts without this one's registration.
onAccountCleared((reason) => {
  if (reason === "signedOut") forgetThisDevice();
});

/** Push for the signed-in account: registering this phone, and opening what a tap is about (docs/notifications.md). */
export const NotificationsProvider = () => {
  usePushRegistration();
  useNotificationTaps();
  return null;
};
