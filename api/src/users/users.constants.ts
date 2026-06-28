import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const entity = "User";

export const USER_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(entity, "ID", id),
  DETAILS_ALREADY_EXIST: (id: string) => `User with ID "${id}" has already completed onboarding`,
  EMAIL_TAKEN: (email: string) => RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(entity, "email", email),
  ONBOARDING_INCOMPLETE: "Onboarding is incomplete. Please complete the user onboarding to continue.",
  AVATAR_FILE_REQUIRED: "Avatar file is required",
  AVATAR_INVALID_TYPE: "Avatar must be a JPEG, PNG, or WebP image",
  AVATAR_TOO_LARGE: "Avatar must be 5 MB or smaller",
  AVATAR_NOT_SET: "User has no avatar to delete",
};

export const USER_AVATAR_CONSTANTS = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  keyForUser: (userId: string) => `avatars/${userId}`,
};
