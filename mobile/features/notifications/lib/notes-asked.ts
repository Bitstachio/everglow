import * as SecureStore from "expo-secure-store";

/**
 * Whether this phone has already been asked about notes (06.6). Asked once,
 * the first time someone joins a roll, never again: after that the system
 * settings decide. Per phone, because the permission is per phone.
 */
const NOTES_ASKED_KEY = "push.notes-asked";

export const wasAskedAboutNotes = (): boolean => {
  try {
    return SecureStore.getItem(NOTES_ASKED_KEY) === "1";
  } catch {
    return false;
  }
};

export const markAskedAboutNotes = (): void => {
  try {
    SecureStore.setItem(NOTES_ASKED_KEY, "1");
  } catch {
    // Keychain unavailable: the question may come back once.
  }
};
