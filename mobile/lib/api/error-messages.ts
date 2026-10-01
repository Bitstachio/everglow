/**
 * Client-facing copy for API `code` values defined in api domain constants.
 * Prefer these over Nest `message` bodies — those often include ids and internal detail.
 */
export const API_ERROR_MESSAGES = {
  USERNAME_TAKEN: "This username is taken",
  USERNAME_CHANGE_LIMITED: "You've changed your username too many times recently. Please try again later.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  ORGANIZER_BLOCKED_BY_CALLER: "This event is organized by someone you blocked. Unblock them to join.",
  REMOVED_FROM_EVENT: "You were removed from this event by an organizer.",
  EVENT_UNDER_REVIEW: "This event is under review. No one can join or add photos until the review is over.",
  STORAGE_QUOTA_EXCEEDED: "You've run out of photo storage. Free up space or upgrade to continue.",
  STORAGE_RESERVATION_CONFLICT: "Another upload is in progress. Please try again.",
  IMAGE_UNSUPPORTED_CONTENT_TYPE: "That image type isn't supported. Use JPEG, PNG, or WebP.",
  IMAGE_INVALID_SIZE: "That image is too large or empty. Choose a different file.",
  IMAGE_UPLOAD_NOT_FOUND: "We couldn't find that upload. Please try uploading again.",
  IMAGE_UPLOAD_EXPIRED: "That upload expired. Please request a new upload and try again.",
  IMAGE_UPLOAD_REJECTED: "That image couldn't be accepted. Please try a different file.",
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_MESSAGES;

export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null) return undefined;
  return API_ERROR_MESSAGES[code as ApiErrorCode];
};
