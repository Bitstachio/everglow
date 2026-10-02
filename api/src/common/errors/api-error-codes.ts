import { HttpStatus } from "@nestjs/common";
import { RATE_LIMIT_EXCEEDED_CODE } from "src/common/rate-limit/rate-limit.constants";
import {
  EVENT_UNDER_REVIEW_CODE,
  ORGANIZER_BLOCKED_BY_CALLER_CODE,
  REMOVED_FROM_EVENT_CODE,
} from "src/events/events.constants";
import { IMAGE_UPLOAD_ERROR_CODES, MAX_IMAGE_SIZE_BYTES } from "src/images/images.constants";
import { STORAGE_RESERVATION_CONFLICT_CODE } from "src/photos/photos.constants";
import { PLAN_LIMIT_CODES } from "src/plans/plans.constants";
import {
  DETAILS_ALREADY_EXIST_CODE,
  ONBOARDING_INCOMPLETE_CODE,
  USERNAME_CHANGE_LIMIT,
  USERNAME_CHANGE_LIMITED_CODE,
  USERNAME_CHANGE_WINDOW_DAYS,
  USERNAME_RESERVED_CODE,
  USERNAME_TAKEN_CODE,
} from "src/users/users.constants";

export type ApiErrorParams = Record<string, unknown>;

export type ApiErrorDefinition = {
  status: number;
  message: string | ((params: ApiErrorParams) => string);
};

// Keep keys alphabetical by string value so reviews and diffs stay stable
export const API_ERROR_REGISTRY = {
  [PLAN_LIMIT_CODES.ACTIVE_EVENT_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: ApiErrorParams) => `Active event limit reached (${String(limit)})`,
  },
  [DETAILS_ALREADY_EXIST_CODE]: {
    status: HttpStatus.CONFLICT,
    message: "User has already completed onboarding",
  },
  [PLAN_LIMIT_CODES.EVENT_GALLERY_CLOSED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is closed",
  },
  [PLAN_LIMIT_CODES.EVENT_GALLERY_NOT_OPEN]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event gallery is not open",
  },
  [PLAN_LIMIT_CODES.EVENT_MEMBER_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ limit }: ApiErrorParams) => `Event member limit reached (${String(limit)})`,
  },
  [PLAN_LIMIT_CODES.EVENT_SCHEDULE_LOCKED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event schedule is locked",
  },
  [PLAN_LIMIT_CODES.EVENT_STILL_ACTIVE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is still active",
  },
  [PLAN_LIMIT_CODES.EVENT_STORAGE_LIMIT_REACHED]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event storage limit reached",
  },
  [EVENT_UNDER_REVIEW_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Event is under review",
  },
  [IMAGE_UPLOAD_ERROR_CODES.INVALID_SIZE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ sizeBytes }: ApiErrorParams) =>
      `Image size out of range (1–${MAX_IMAGE_SIZE_BYTES} bytes); received ${String(sizeBytes)}`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ contentType }: ApiErrorParams) => `Unsupported image content type "${String(contentType)}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_EXPIRED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: ApiErrorParams) => `Image upload "${String(uploadId)}" expired before confirmation`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: ({ uploadId }: ApiErrorParams) => `No uploaded image found for upload "${String(uploadId)}"`,
  },
  [IMAGE_UPLOAD_ERROR_CODES.UPLOAD_REJECTED]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: ({ uploadId }: ApiErrorParams) =>
      `Uploaded image for upload "${String(uploadId)}" rejected (unsupported type or size)`,
  },
  [ONBOARDING_INCOMPLETE_CODE]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "Onboarding is incomplete",
  },
  [ORGANIZER_BLOCKED_BY_CALLER_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: ({ organizerName }: ApiErrorParams) =>
      `Caller blocked event organizer${organizerName == null ? "" : ` "${String(organizerName)}"`}`,
  },
  [RATE_LIMIT_EXCEEDED_CODE]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: "Rate limit exceeded",
  },
  [REMOVED_FROM_EVENT_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Caller was removed from the event",
  },
  [STORAGE_RESERVATION_CONFLICT_CODE]: {
    status: HttpStatus.CONFLICT,
    message: "Storage reservation conflicted with a concurrent upload",
  },
  [USERNAME_CHANGE_LIMITED_CODE]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: ({ availableAt }: ApiErrorParams) => {
      const when = availableAt instanceof Date ? availableAt.toISOString() : String(availableAt);
      return `Username change limit reached (${USERNAME_CHANGE_LIMIT} per ${USERNAME_CHANGE_WINDOW_DAYS} days); available after ${when}`;
    },
  },
  [USERNAME_RESERVED_CODE]: {
    status: HttpStatus.BAD_REQUEST,
    message: ({ username }: ApiErrorParams) => `Username "${String(username)}" is reserved`,
  },
  [USERNAME_TAKEN_CODE]: {
    status: HttpStatus.CONFLICT,
    message: ({ username }: ApiErrorParams) => `Username "${String(username)}" is taken`,
  },
} as const satisfies Record<string, ApiErrorDefinition>;

export type ApiErrorCode = keyof typeof API_ERROR_REGISTRY;

// OpenAPI `code` enum; sorted for stable diffs
export const API_ERROR_CODES = (Object.keys(API_ERROR_REGISTRY) as ApiErrorCode[]).sort((a, b) => a.localeCompare(b));

export const resolveApiErrorMessage = (code: ApiErrorCode, params: ApiErrorParams = {}): string => {
  const { message } = API_ERROR_REGISTRY[code];
  return typeof message === "function" ? message(params) : message;
};
