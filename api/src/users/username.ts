import { STRING_LIMITS } from "src/common/constants/schema.constants";
import { RESERVED_USERNAMES, USERNAME_PATTERN } from "./users.constants";

export type UsernameAvailabilityReason = "INVALID_FORMAT" | "TAKEN" | "RESERVED" | null;

/** Trim and lowercase. Does not validate format. */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();

export const isUsernameFormatValid = (username: string): boolean =>
  username.length >= 3 && username.length <= STRING_LIMITS.USERNAME && USERNAME_PATTERN.test(username);

export const isReservedUsername = (username: string): boolean => RESERVED_USERNAMES.has(username);

/**
 * Classify a normalized candidate before the uniqueness check.
 * Returns INVALID_FORMAT or RESERVED, or null when the format is fine.
 */
export const usernameFormatReason = (username: string): Exclude<UsernameAvailabilityReason, "TAKEN" | null> | null => {
  if (!isUsernameFormatValid(username)) return "INVALID_FORMAT";
  if (isReservedUsername(username)) return "RESERVED";
  return null;
};

/**
 * Build a username base from an email local part (same rules as the backfill migration).
 * Callers must still resolve uniqueness collisions.
 */
export const deriveUsernameBaseFromEmail = (email: string): string => {
  let base = normalizeUsername(email.split("@")[0] ?? "").replace(/[^a-z0-9._]/g, "");

  if (!base) base = "usr";
  else if (base.length < 3) base = base.padEnd(3, "x");
  else if (base.length > STRING_LIMITS.USERNAME) base = base.slice(0, STRING_LIMITS.USERNAME);

  if (isReservedUsername(base)) {
    base = `${base.slice(0, STRING_LIMITS.USERNAME - 1)}1`;
  }

  return base;
};

/** Append a numeric suffix so `base` + suffix fits in USERNAME max length. */
export const usernameWithSuffix = (base: string, suffix: number): string => {
  if (suffix <= 1) return base.slice(0, STRING_LIMITS.USERNAME);
  const suffixText = String(suffix);
  return `${base.slice(0, Math.max(1, STRING_LIMITS.USERNAME - suffixText.length))}${suffixText}`;
};
