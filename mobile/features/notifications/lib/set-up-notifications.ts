import * as Notifications from "expo-notifications";
import { onAccountCleared } from "@/lib/account-cleared";
import { onBeforeSignOut } from "@/lib/before-sign-out";
import { resetDeviceRegistration, unregisterThisDevice } from "./device-registration";
import { foregroundBehavior } from "./foreground";
import { forgetTaps } from "./notification-taps";

/**
 * Wires push into the app, once, from the notifications provider: how a
 * notification shows in the foreground, and what sign-out and a cleared
 * account do to this phone's registration and taps. Returns the undo.
 */
export const setUpNotifications = (): (() => void) => {
  Notifications.setNotificationHandler({
    handleNotification: (notification) => Promise.resolve(foregroundBehavior(notification)),
  });
  // A deleted account's phones went with it on the API; anything else unregisters while it still can.
  const offBeforeSignOut = onBeforeSignOut(({ reason }) =>
    reason === "accountDeleted" ? undefined : unregisterThisDevice(),
  );
  // Whatever happened, the next account on this phone starts without this one's registration or taps.
  const offAccountCleared = onAccountCleared((reason) => {
    resetDeviceRegistration(reason);
    forgetTaps();
  });
  return () => {
    Notifications.setNotificationHandler(null);
    offBeforeSignOut();
    offAccountCleared();
  };
};
