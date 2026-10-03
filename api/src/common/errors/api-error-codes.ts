import { RATE_LIMIT_API_ERRORS } from "src/common/rate-limit/rate-limit.errors";
import { EVENT_API_ERRORS } from "src/events/events.errors";
import { IMAGE_API_ERRORS } from "src/images/images.errors";
import { PHOTO_API_ERRORS } from "src/photos/photos.errors";
import { PLAN_API_ERRORS } from "src/plans/plans.errors";
import { USER_API_ERRORS } from "src/users/users.errors";
import type { ApiErrorDefinition } from "./api-error.types";
import { HTTP_API_ERRORS } from "./http.errors";

export type { ApiErrorDefinition } from "./api-error.types";

export const API_ERROR_SLICES = [
  HTTP_API_ERRORS,
  USER_API_ERRORS,
  EVENT_API_ERRORS,
  IMAGE_API_ERRORS,
  PLAN_API_ERRORS,
  PHOTO_API_ERRORS,
  RATE_LIMIT_API_ERRORS,
] as const;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type ApiErrorRegistry = UnionToIntersection<(typeof API_ERROR_SLICES)[number]>;

export const API_ERROR_REGISTRY = Object.assign({}, ...API_ERROR_SLICES) as ApiErrorRegistry satisfies Record<
  string,
  ApiErrorDefinition
>;

export type ApiErrorCode = keyof typeof API_ERROR_REGISTRY;

export type ParamsOf<C extends ApiErrorCode> =
  (typeof API_ERROR_REGISTRY)[C]["message"] extends (params: infer P) => string ? P : never;

export type ApiErrorArgs<C extends ApiErrorCode> = [ParamsOf<C>] extends [never] ? [] : [ParamsOf<C>];

export const API_ERROR_CODES = (Object.keys(API_ERROR_REGISTRY) as ApiErrorCode[]).sort();

export const resolveApiErrorMessage = <C extends ApiErrorCode>(code: C, ...params: ApiErrorArgs<C>): string => {
  const { message } = API_ERROR_REGISTRY[code];
  if (typeof message === "function") {
    return (message as (params: ParamsOf<C>) => string)(params[0] as ParamsOf<C>);
  }
  return message;
};
