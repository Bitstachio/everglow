import { resolveApiErrorMessage, type ApiErrorCode } from "src/common/errors/api-error-codes";

export type ErrorResponse = {
  message: string;
  code: string;
  meta: {
    timestamp: string;
    path: string;
  };
};

/** Assert the filter-supplied (or catalogued) envelope for an HTTP error. */
export const expectApiError = (body: unknown, code: ApiErrorCode): void => {
  expect(body).toMatchObject({
    code,
    message: resolveApiErrorMessage(code),
  });
};
