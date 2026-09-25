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
