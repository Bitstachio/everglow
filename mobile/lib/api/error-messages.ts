import type { ApiErrorDto } from "@/lib/api/generated";

export type ApiErrorCode = ApiErrorDto["code"];

export const API_ERROR_MESSAGES = {
  ACTIVE_EVENT_LIMIT_REACHED: "Active event limit reached on the free plan",
  BAD_REQUEST: "Invalid request",
  CONFLICT: "That action conflicts with the current state",
  DETAILS_ALREADY_EXIST: "Profile setup already completed",
  EVENT_GALLERY_CLOSED: "Event gallery is closed",
  EVENT_GALLERY_NOT_OPEN: "Event gallery is not open",
  EVENT_MEMBER_LIMIT_REACHED: "Event member limit reached",
  EVENT_SCHEDULE_LOCKED: "Event schedule is locked",
  EVENT_STILL_ACTIVE: "Event is still active",
  EVENT_STORAGE_LIMIT_REACHED: "Event storage limit reached",
  EVENT_UNDER_REVIEW: "Event is under review",
  FORBIDDEN: "You do not have permission to do that",
  IMAGE_INVALID_SIZE: "Image size is invalid",
  IMAGE_UNSUPPORTED_CONTENT_TYPE: "Image content type is unsupported",
  IMAGE_UPLOAD_EXPIRED: "Image upload expired",
  IMAGE_UPLOAD_NOT_FOUND: "Image upload not found",
  IMAGE_UPLOAD_REJECTED: "Image upload rejected",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
  NOT_FOUND: "Not found",
  ONBOARDING_INCOMPLETE: "Profile setup is incomplete",
  ORGANIZER_BLOCKED_BY_CALLER: "Event organizer is blocked by the caller",
  RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
  REMOVED_FROM_EVENT: "Removed from event by an organizer",
  STORAGE_RESERVATION_CONFLICT: "Storage reservation conflict",
  TOO_MANY_REQUESTS: "Too many requests. Please try again later.",
  UNAUTHORIZED: "Please sign in again",
  UNPROCESSABLE_ENTITY: "This request cannot be completed",
  USERNAME_CHANGE_LIMITED: "Username change limit reached",
  USERNAME_RESERVED: "Username is reserved",
  USERNAME_TAKEN: "Username is taken",
} as const satisfies Record<ApiErrorCode, string>;

export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null) return undefined;
  return API_ERROR_MESSAGES[code as ApiErrorCode];
};
