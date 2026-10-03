import type { ApiErrorDto } from "@/lib/api/generated";
import { EVENT_ERROR_MESSAGES } from "./error-message-domains/events";
import { HTTP_ERROR_MESSAGES } from "./error-message-domains/http";
import { IMAGE_ERROR_MESSAGES } from "./error-message-domains/images";
import { PHOTO_ERROR_MESSAGES } from "./error-message-domains/photos";
import { PLAN_ERROR_MESSAGES } from "./error-message-domains/plans";
import { RATE_LIMIT_ERROR_MESSAGES } from "./error-message-domains/rate-limit";
import { USER_ERROR_MESSAGES } from "./error-message-domains/users";

export type ApiErrorCode = NonNullable<ApiErrorDto["code"]>;

export const API_ERROR_MESSAGE_DOMAINS = [
  HTTP_ERROR_MESSAGES,
  USER_ERROR_MESSAGES,
  EVENT_ERROR_MESSAGES,
  IMAGE_ERROR_MESSAGES,
  PLAN_ERROR_MESSAGES,
  PHOTO_ERROR_MESSAGES,
  RATE_LIMIT_ERROR_MESSAGES,
] as const;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type MergedErrorMessages = UnionToIntersection<(typeof API_ERROR_MESSAGE_DOMAINS)[number]>;

export const API_ERROR_MESSAGES = Object.assign(
  {},
  ...API_ERROR_MESSAGE_DOMAINS,
) as MergedErrorMessages satisfies Record<ApiErrorCode, string>;

export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null) return undefined;
  return API_ERROR_MESSAGES[code as ApiErrorCode];
};
