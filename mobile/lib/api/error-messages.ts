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

type ExclusiveMergeAll<Domains extends readonly Record<string, string>[]> = Domains extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends Record<string, string>
    ? Tail extends readonly Record<string, string>[]
      ? ExclusiveMergeAll<Tail> extends infer Rest
        ? Rest extends Record<string, string>
          ? Extract<keyof Head, keyof Rest> extends never
            ? Head & Rest
            : ["Duplicate API error message keys:", Extract<keyof Head, keyof Rest>]
          : Rest
        : never
      : Head
    : never
  : Record<never, never>;

type MergedErrorMessages = ExclusiveMergeAll<typeof API_ERROR_MESSAGE_DOMAINS>;

export const API_ERROR_MESSAGES = {
  ...HTTP_ERROR_MESSAGES,
  ...USER_ERROR_MESSAGES,
  ...EVENT_ERROR_MESSAGES,
  ...IMAGE_ERROR_MESSAGES,
  ...PLAN_ERROR_MESSAGES,
  ...PHOTO_ERROR_MESSAGES,
  ...RATE_LIMIT_ERROR_MESSAGES,
} as const satisfies Record<ApiErrorCode, string> & MergedErrorMessages;

export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null) return undefined;
  return API_ERROR_MESSAGES[code as ApiErrorCode];
};
