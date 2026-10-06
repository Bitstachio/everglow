/**
 * What `AllExceptionsFilter` records about an error response, for that
 * request's completion line in the access log (`customProps` in
 * logging.config.ts). Never sent to the client: the response carries only the
 * catalogue `code` and its copy.
 */
export interface ErrorLogFields {
  /** The `code` sent to the client. */
  errorCode: string;
  /**
   * Why the request failed, in words for us: the catalogue message with its
   * params, the exception's own message, or a validation failure's field errors.
   */
  errorReason: string;
}

// A symbol, so nothing else that decorates the response object can collide with it.
const ERROR_LOG_FIELDS = Symbol("errorLogFields");

type WithErrorLogFields = { [ERROR_LOG_FIELDS]?: ErrorLogFields };

export const recordErrorLogFields = (res: object, fields: ErrorLogFields): void => {
  (res as WithErrorLogFields)[ERROR_LOG_FIELDS] = fields;
};

export const errorLogFieldsOf = (res: object): ErrorLogFields | undefined =>
  (res as WithErrorLogFields)[ERROR_LOG_FIELDS];
