import { AccountDeletionPhotoPolicy } from "generated/prisma/client";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";

const entity = "User";

export const USER_SERVICE_ERRORS = {
  NOT_FOUND: (id: string) => RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(entity, "ID", id),
  DETAILS_ALREADY_EXIST: (id: string) => `User with ID "${id}" has already completed onboarding`,
  EMAIL_TAKEN: (email: string) => RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(entity, "email", email),
  ONBOARDING_INCOMPLETE: "Onboarding is incomplete. Please complete the user onboarding to continue.",
  ACCOUNT_DELETED: "This account has been deleted. Sign in again to start a new one.",
};

export const DEFAULT_ACCOUNT_DELETION_RECONCILER_BATCH_SIZE = 50;
export const DEFAULT_ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS = 1;

// A saga that has failed this many times is not going to succeed by being run
// again on the next tick: it needs a person. The row stops being picked up and
// is reported once, instead of alerting every hour forever.
export const DEFAULT_ACCOUNT_DELETION_MAX_ATTEMPTS = 5;

/**
 * Photos the account uploaded into events that outlive it stay in the event by
 * default, with no uploader. An event album is a shared space: a guest's photos
 * of the wedding are the couple's memories too, and messaging products treat
 * shared media the same way. Callers who want them gone pass `?photos=DELETE`.
 */
export const DEFAULT_ACCOUNT_DELETION_PHOTO_POLICY = AccountDeletionPhotoPolicy.KEEP;
