import { AccountDeletionPhotoPolicy } from "generated/prisma/client";

/**
 * Instagram-style limit on changing a username after onboarding: at most this
 * many changes in any rolling window. Choosing the first username at
 * onboarding does not count, and saving the same username is not a change.
 */
export const USERNAME_CHANGE_LIMIT = 2;
export const USERNAME_CHANGE_WINDOW_DAYS = 14;

/** Matches mobile `use-edit-username-form.ts`: lowercase letters, digits, `.`, `_`. */
export const USERNAME_PATTERN = /^[a-z0-9._]+$/;

/** Brand and system handles nobody may claim. */
export const RESERVED_USERNAMES = new Set(["admin", "everglow", "support", "api"]);

// avatars/{userId}/{uploadId}; see docs/image-uploads.md.
export const USER_AVATAR_S3_KEY_PREFIX = "avatars/";

/**
 * Auth0 derives the subject for its Apple social connection from Apple's
 * stable user identifier: `apple|001234.abcd…`. The prefix is the provider
 * name, which is how the API tells an Apple identity from any other without
 * a second lookup.
 */
export const APPLE_PROVIDER = "apple";
export const isAppleProviderSub = (providerSub: string): boolean => providerSub.startsWith(`${APPLE_PROVIDER}|`);

export const DEFAULT_ACCOUNT_DELETION_RECONCILER_BATCH_SIZE = 50;
export const DEFAULT_ACCOUNT_DELETION_RECONCILER_STUCK_AFTER_HOURS = 1;

// A saga that has failed this many times is not going to succeed by being run
// again on the next tick: it needs a person. The row stops being picked up and
// is reported once, instead of alerting every hour forever.
export const DEFAULT_ACCOUNT_DELETION_MAX_ATTEMPTS = 5;

/**
 * `DELETE /users/me` has no default: `?photos=` is required, because both
 * outcomes are irreversible and neither is safe to guess (see
 * docs/account-deletion.md). This is the fallback for a saga that is *resumed*
 * with no stored choice, which the reconciler cannot ask anyone about. It keeps
 * the photos: an event album is a shared space, and a guest's photos of the
 * wedding are the couple's memories too, so the recoverable outcome wins over
 * destroying other people's media on a row we know nothing about.
 */
export const ACCOUNT_DELETION_PHOTO_POLICY_FALLBACK = AccountDeletionPhotoPolicy.KEEP;
