import { ApiException } from "src/common/errors/api.exception";

/**
 * 429 with a stable machine-readable `code`, surfaced by AllExceptionsFilter in
 * the standard error envelope. The wait time travels in the `Retry-After`
 * header, which the guard sets before throwing.
 */
export class RateLimitExceededException extends ApiException<"RATE_LIMIT_EXCEEDED"> {
  constructor() {
    super("RATE_LIMIT_EXCEEDED");
  }
}
