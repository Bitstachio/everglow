import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "./api-error.types";

/** Status-aligned fallbacks when a Nest HTTP exception carries no catalog `code`. */
export const BAD_REQUEST_CODE = "BAD_REQUEST" as const;
export const UNAUTHORIZED_CODE = "UNAUTHORIZED" as const;
export const FORBIDDEN_CODE = "FORBIDDEN" as const;
export const NOT_FOUND_CODE = "NOT_FOUND" as const;
export const CONFLICT_CODE = "CONFLICT" as const;
export const TOO_MANY_REQUESTS_CODE = "TOO_MANY_REQUESTS" as const;
export const UNPROCESSABLE_ENTITY_CODE = "UNPROCESSABLE_ENTITY" as const;
export const INTERNAL_ERROR_CODE = "INTERNAL_ERROR" as const;

/** A filter-supplied generic code: all of them have a plain message. */
export type HttpApiErrorCode = keyof typeof HTTP_API_ERRORS;

export const HTTP_API_ERRORS = {
  [BAD_REQUEST_CODE]: {
    status: HttpStatus.BAD_REQUEST,
    message: "Bad request",
  },
  [UNAUTHORIZED_CODE]: {
    status: HttpStatus.UNAUTHORIZED,
    message: "Unauthorized",
  },
  [FORBIDDEN_CODE]: {
    status: HttpStatus.FORBIDDEN,
    message: "Forbidden",
  },
  [NOT_FOUND_CODE]: {
    status: HttpStatus.NOT_FOUND,
    message: "Not found",
  },
  [CONFLICT_CODE]: {
    status: HttpStatus.CONFLICT,
    message: "Conflict",
  },
  [TOO_MANY_REQUESTS_CODE]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: "Too many requests",
  },
  [UNPROCESSABLE_ENTITY_CODE]: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: "Unprocessable entity",
  },
  [INTERNAL_ERROR_CODE]: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "Internal server error",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
