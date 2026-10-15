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

/** How many free alternatives the availability check offers for a taken name. */
export const USERNAME_SUGGESTION_COUNT = 4;

/** Lowercase ASCII words of a display name: "Zoë O'Neil" -> ["zoe", "oneil"]. */
const nameWords = (name: string): string[] =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** A whole number from `min` to `max`, both included. */
const randomBetween = (min: number, max: number, random: () => number): number =>
  min + Math.floor(random() * (max - min + 1));

/**
 * Alternatives for a taken or reserved username, best first, built from the
 * username and the person's name: "maya" for Maya Chen in 2026 gives
 * maya.chen, mayachen, maya_c, maya.c26, then the year (maya.26, maya_26),
 * then maya2 to maya9, then random two- and three-digit endings (maya47,
 * maya_83, maya318, maya.506) so a very common name never runs out. Every
 * candidate is valid and unreserved; whether it is free is the caller's check.
 */
export const usernameCandidates = (
  username: string,
  name = "",
  { year = new Date().getFullYear(), random = Math.random }: { year?: number; random?: () => number } = {},
): string[] => {
  const words = nameWords(name);
  const last = words.length > 1 ? words[words.length - 1] : "";
  const yy = String(year % 100).padStart(2, "0");

  // A long username is cut so the suffix still fits.
  const withSuffix = (suffix: string) => `${username.slice(0, STRING_LIMITS.USERNAME - suffix.length)}${suffix}`;
  const fromName = last ? [`.${last}`, last, `_${last[0]}`, `.${last[0]}${yy}`] : [];
  const numbered = [`.${yy}`, `_${yy}`, ...Array.from({ length: 8 }, (_, i) => String(i + 2))];
  const randomEndings = [
    String(randomBetween(10, 99, random)),
    `_${randomBetween(10, 99, random)}`,
    String(randomBetween(100, 999, random)),
    `.${randomBetween(100, 999, random)}`,
  ];

  const seen = new Set<string>([username]);
  return [...fromName, ...numbered, ...randomEndings].map(withSuffix).filter((candidate) => {
    if (seen.has(candidate) || usernameFormatReason(candidate) !== null) return false;
    seen.add(candidate);
    return true;
  });
};
