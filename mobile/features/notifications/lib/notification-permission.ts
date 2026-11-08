import { askPushPermission } from "./push";

const grantedListeners = new Set<() => void>();

/** Runs when the person allows notifications from inside the app, so this phone registers at once. */
export const onNotificationPermissionGranted = (listener: () => void) => {
  grantedListeners.add(listener);
  return () => {
    grantedListeners.delete(listener);
  };
};

/**
 * Shows the system prompt, for 06.6 and the 14.9 Notes screen
 * ([EV-142](https://linear.app/mehrshadfb/issue/EV-142)). When the person
 * allows it, the signed-in account's registration follows on its own.
 * Once the system has answered, iOS never shows the prompt again: from then
 * on only the system settings change it.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  const granted = await askPushPermission();
  if (granted) grantedListeners.forEach((listener) => listener());
  return granted;
};
