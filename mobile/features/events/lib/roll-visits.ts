import * as SecureStore from "expo-secure-store";

/**
 * When this account last looked at each roll on this device, so the sheet can
 * tick frames added since (07.5) and show "It opens" once (07.3). Kept on the
 * device only, per account so another sign-in starts fresh; losing it only
 * means no ticks on the next visit.
 */
const key = (userId: string, eventId: string) => `roll-visit.${userId}.${eventId}`;

export const readLastVisit = (userId: string, eventId: string): string | null => {
  try {
    return SecureStore.getItem(key(userId, eventId));
  } catch {
    return null;
  }
};

export const writeLastVisit = (userId: string, eventId: string, at: Date = new Date()): void => {
  try {
    SecureStore.setItem(key(userId, eventId), at.toISOString());
  } catch {
    // Not available (simulator keychain locked, web): the next visit just has no ticks.
  }
};
