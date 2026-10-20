import * as SecureStore from "expo-secure-store";

/**
 * When this device last looked at each roll, so the sheet can tick frames
 * added since (07.5) and show "It opens" once (07.3). Kept on the device only;
 * losing it only means no ticks on the next visit.
 */
const key = (eventId: string) => `roll-visit.${eventId}`;

export const readLastVisit = (eventId: string): string | null => {
  try {
    return SecureStore.getItem(key(eventId));
  } catch {
    return null;
  }
};

export const writeLastVisit = (eventId: string, at: Date = new Date()): void => {
  try {
    SecureStore.setItem(key(eventId), at.toISOString());
  } catch {
    // Not available (simulator keychain locked, web): the next visit just has no ticks.
  }
};
