import { RATE_LIMIT_API_ERRORS } from "src/common/rate-limit/rate-limit.errors";
import { EVENT_API_ERRORS } from "src/events/events.errors";
import { IMAGE_API_ERRORS } from "src/images/images.errors";
import { PHOTO_API_ERRORS } from "src/photos/photos.errors";
import { PLAN_API_ERRORS } from "src/plans/plans.errors";
import { USER_API_ERRORS } from "src/users/users.errors";
import type { ApiErrorDefinition, ApiErrorParams } from "./api-error.types";

export type { ApiErrorDefinition, ApiErrorParams } from "./api-error.types";

export const API_ERROR_REGISTRY = {
  ...USER_API_ERRORS,
  ...EVENT_API_ERRORS,
  ...IMAGE_API_ERRORS,
  ...PLAN_API_ERRORS,
  ...PHOTO_API_ERRORS,
  ...RATE_LIMIT_API_ERRORS,
} as const satisfies Record<string, ApiErrorDefinition>;

export type ApiErrorCode = keyof typeof API_ERROR_REGISTRY;

export const API_ERROR_CODES = (Object.keys(API_ERROR_REGISTRY) as ApiErrorCode[]).sort((a, b) => a.localeCompare(b));

export const resolveApiErrorMessage = (code: ApiErrorCode, params: ApiErrorParams = {}): string => {
  const { message } = API_ERROR_REGISTRY[code];
  return typeof message === "function" ? message(params) : message;
};
