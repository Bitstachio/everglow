import type { ApiErrorDto } from "@/lib/api/generated";

/**
 * Closed set of machine-readable API `code` values from the shared OpenAPI
 * error envelope (`ApiErrorDto`).
 */
export type ApiErrorCode = NonNullable<ApiErrorDto["code"]>;

/**
 * Client-facing copy for each OpenAPI error `code`.
 * Prefer these over Nest `message` bodies, which often include IDs and internal details.
 *
 * `satisfies Record<ApiErrorCode, string>` fails the build when the API adds a code
 * that this map does not cover (or when a key is mistyped).
 */
export const API_ERROR_MESSAGES = {
  ACTIVE_EVENT_LIMIT_REACHED:
    "You already have 2 active events on the free plan. One frees up when a gallery closes or you delete an event.",
  EVENT_GALLERY_CLOSED: "This event's gallery has closed.",
  EVENT_MEMBER_LIMIT_REACHED: "This event is full.",
  EVENT_STORAGE_LIMIT_REACHED: "This gallery is full. There isn't enough storage left for these photos.",
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
