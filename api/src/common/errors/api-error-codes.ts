import { RATE_LIMIT_EXCEEDED_CODE } from "src/common/rate-limit/rate-limit.constants";
import {
  EVENT_UNDER_REVIEW_CODE,
  ORGANIZER_BLOCKED_BY_CALLER_CODE,
  REMOVED_FROM_EVENT_CODE,
} from "src/events/events.constants";
import { IMAGE_UPLOAD_ERROR_CODES } from "src/images/images.constants";
import { PLAN_LIMIT_CODES } from "src/plans/plans.constants";
import { STORAGE_QUOTA_EXCEEDED_CODE, STORAGE_RESERVATION_CONFLICT_CODE } from "src/photos/photos.constants";
import { USERNAME_CHANGE_LIMITED_CODE, USERNAME_TAKEN_CODE } from "src/users/users.constants";

/**
 * Closed set of machine-readable `code` values the API may put on the error
 * envelope. Domain modules own each constant; `ApiErrorDto` publishes this
 * list as the OpenAPI `code` enum so clients can generate a typed union.
 *
 * Keep alphabetical by string value so reviews and diffs stay stable.
 */
export const API_ERROR_CODES = [
  PLAN_LIMIT_CODES.ACTIVE_EVENT_LIMIT_REACHED,
  PLAN_LIMIT_CODES.EVENT_GALLERY_CLOSED,
  PLAN_LIMIT_CODES.EVENT_MEMBER_LIMIT_REACHED,
  PLAN_LIMIT_CODES.EVENT_STORAGE_LIMIT_REACHED,
  EVENT_UNDER_REVIEW_CODE,
  IMAGE_UPLOAD_ERROR_CODES.INVALID_SIZE,
  IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE,
  IMAGE_UPLOAD_ERROR_CODES.UPLOAD_EXPIRED,
  IMAGE_UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND,
  IMAGE_UPLOAD_ERROR_CODES.UPLOAD_REJECTED,
  ORGANIZER_BLOCKED_BY_CALLER_CODE,
  RATE_LIMIT_EXCEEDED_CODE,
  REMOVED_FROM_EVENT_CODE,
  STORAGE_QUOTA_EXCEEDED_CODE,
  STORAGE_RESERVATION_CONFLICT_CODE,
  USERNAME_CHANGE_LIMITED_CODE,
  USERNAME_TAKEN_CODE,
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
