import { z } from "zod";

/** Matches API `USERNAME_PATTERN` and mobile edit-form rules. */
export const USERNAME_PATTERN = /^[a-z0-9._]+$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export const USERNAME_FORMAT_MESSAGE = "Use lowercase letters, numbers, periods, or underscores";

export type UsernameAvailabilityReason = "INVALID_FORMAT" | "TAKEN" | "RESERVED";

/** Trim and lowercase. Does not validate format. */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();

export const isUsernameFormatValid = (username: string): boolean =>
  username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(username);

export const usernameAvailabilityMessage = (reason: UsernameAvailabilityReason | null | undefined): string | null => {
  switch (reason) {
    case "INVALID_FORMAT":
      return USERNAME_FORMAT_MESSAGE;
    case "TAKEN":
      return "This username is taken";
    case "RESERVED":
      return "This username is reserved";
    default:
      return null;
  }
};

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`)
  .regex(USERNAME_PATTERN, USERNAME_FORMAT_MESSAGE);

export const editUsernameSchema = z.object({
  username: usernameSchema,
});

export type EditUsernameValues = z.infer<typeof editUsernameSchema>;
