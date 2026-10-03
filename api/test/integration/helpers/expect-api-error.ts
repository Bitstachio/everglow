import { resolveApiErrorMessage, type ApiErrorArgs, type ApiErrorCode } from "src/common/errors/api-error-codes";

export type ErrorResponse = {
  message: string;
  code: string;
  meta: {
    timestamp: string;
    path: string;
  };
};

/** Assert the filter-supplied (or catalogued) envelope for an HTTP error, with the code's params if it takes any. */
export const expectApiError = <C extends ApiErrorCode>(body: unknown, code: C, ...params: ApiErrorArgs<C>): void => {
  expect(body).toMatchObject({
    code,
    message: resolveApiErrorMessage(code, ...params),
  });
};
