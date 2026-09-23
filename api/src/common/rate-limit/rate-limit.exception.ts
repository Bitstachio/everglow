import { HttpException, HttpStatus } from "@nestjs/common";
import { RATE_LIMIT_EXCEEDED_CODE, RATE_LIMIT_EXCEEDED_MESSAGE } from "./rate-limit.constants";

/**
 * 429 with a stable machine-readable `code`, surfaced by AllExceptionsFilter in
 * the standard error envelope. The wait time travels in the `Retry-After`
 * header, which the guard sets before throwing.
 */
export class RateLimitExceededException extends HttpException {
  constructor() {
    super({ code: RATE_LIMIT_EXCEEDED_CODE, message: RATE_LIMIT_EXCEEDED_MESSAGE }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
