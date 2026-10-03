import { ApiException } from "src/common/errors/api.exception";
import { RATE_LIMIT_EXCEEDED_CODE } from "./rate-limit.constants";

/**
 * 429 with a stable machine-readable `code`, surfaced by AllExceptionsFilter in
 * the standard error envelope. The wait time travels in the `Retry-After`
 * header, which the guard sets before throwing.
 */
export class RateLimitExceededException extends ApiException {
  constructor() {
    super(RATE_LIMIT_EXCEEDED_CODE);
  }
}
