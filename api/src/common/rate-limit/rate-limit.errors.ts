import { HttpStatus } from "@nestjs/common";
import type { ApiErrorDefinition } from "src/common/errors/api-error.types";
import { RATE_LIMIT_EXCEEDED_CODE } from "./rate-limit.constants";

export const RATE_LIMIT_API_ERRORS = {
  [RATE_LIMIT_EXCEEDED_CODE]: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: "Rate limit exceeded",
  },
} as const satisfies Record<string, ApiErrorDefinition>;
