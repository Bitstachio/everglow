import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const entity = "User";

export const USER_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(entity, "ID", id),
  DETAILS_ALREADY_EXIST: (id: string) => `User with ID "${id}" has already completed onboarding`,
  EMAIL_TAKEN: (email: string) => RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(entity, "email", email),
  ONBOARDING_INCOMPLETE: "Onboarding is incomplete. Please complete the user onboarding to continue.",
  ACCOUNT_DELETED: "This account has been deleted. Sign in again to start a new one.",
};

// What happens to READY photos the account uploaded into events that outlive
// it. KEEP leaves them in the event without an uploader, the way a message
// stays in a group chat after its sender is gone; DELETE removes them
// everywhere. See docs/account-deletion.md for why KEEP is the default.
export const ACCOUNT_DELETION_PHOTO_POLICIES = {
  KEEP: "keep",
  DELETE: "delete",
} as const;

export type AccountDeletionPhotoPolicy =
  (typeof ACCOUNT_DELETION_PHOTO_POLICIES)[keyof typeof ACCOUNT_DELETION_PHOTO_POLICIES];

export const DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY: AccountDeletionPhotoPolicy = ACCOUNT_DELETION_PHOTO_POLICIES.KEEP;
