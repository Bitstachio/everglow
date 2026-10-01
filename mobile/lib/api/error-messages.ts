import type { UsersControllerFindMeErrors } from "@/lib/api/generated";

/**
 * Closed set of machine-readable API `code` values from OpenAPI.
 * Hey API inlines this union on every rate-limited operation's 429 body;
 * any `[429]["code"]` is the shared envelope enum.
 */
export type ApiErrorCode = NonNullable<UsersControllerFindMeErrors[429]["code"]>;

/**
 * Client-facing copy for each OpenAPI error `code`.
 * Prefer these over Nest `message` bodies, which often include IDs and internal details.
 *
 * `satisfies Record<ApiErrorCode, string>` fails the build when the API adds a code
 * that this map does not cover (or when a key is mistyped).
 */
export const API_ERROR_MESSAGES = {
  EVENT_UNDER_REVIEW: "This event is under review. No one can join or add photos until the review is over.",
  IMAGE_INVALID_SIZE: "That image is too large or empty. Choose a different file.",
  IMAGE_UNSUPPORTED_CONTENT_TYPE: "That image type isn't supported. Use JPEG, PNG, or WebP.",
  IMAGE_UPLOAD_EXPIRED: "That upload expired. Please request a new upload and try again.",
  IMAGE_UPLOAD_NOT_FOUND: "We couldn't find that upload. Please try uploading again.",
  IMAGE_UPLOAD_REJECTED: "That image couldn't be accepted. Please try a different file.",
  ORGANIZER_BLOCKED_BY_CALLER: "This event is organized by someone you blocked. Unblock them to join.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  REMOVED_FROM_EVENT: "You were removed from this event by an organizer.",
  STORAGE_QUOTA_EXCEEDED: "You've run out of photo storage. Free up space or upgrade to continue.",
  STORAGE_RESERVATION_CONFLICT: "Another upload is in progress. Please try again.",
  USERNAME_CHANGE_LIMITED: "You've changed your username too many times recently. Please try again later.",
  USERNAME_TAKEN: "This username is taken",
} as const satisfies Record<ApiErrorCode, string>;

export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null) return undefined;
  return API_ERROR_MESSAGES[code as ApiErrorCode];
};
