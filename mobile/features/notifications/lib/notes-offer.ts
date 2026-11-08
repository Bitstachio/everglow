import { File, Paths } from "expo-file-system";

/**
 * When this phone last said "Not now" to 06.6. Per phone, because the
 * permission is. Kept in the app's documents, not the Keychain: a reinstall
 * resets the system permission, and it must reset this with it.
 */
const notNowFile = () => new File(Paths.document, "notes-not-now.json");

/** How long "Not now" holds before a later join offers notes again. */
export const NOTES_OFFER_AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const readNotNow = (): number | null => {
  try {
    const file = notNowFile();
    if (!file.exists) return null;
    const at = Date.parse((JSON.parse(file.textSync()) as { at?: string }).at ?? "");
    return Number.isNaN(at) ? null : at;
  } catch {
    return null;
  }
};

/** Whether a join may offer notes: never said "Not now", or said it long enough ago. */
export const mayOfferNotes = (now: Date = new Date()): boolean => {
  const at = readNotNow();
  return at === null || now.getTime() - at >= NOTES_OFFER_AGAIN_AFTER_MS;
};

export const rememberNotNow = (now: Date = new Date()): void => {
  try {
    notNowFile().write(JSON.stringify({ at: now.toISOString() }));
  } catch {
    // Can't write: the next join may offer it again.
  }
};
