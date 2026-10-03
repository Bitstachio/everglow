import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Request } from "express";
import { ApiErrorDto } from "src/common/errors/api-error.dto";
import { API_ERROR_REGISTRY, resolveApiErrorMessage, type ApiErrorCode } from "src/common/errors/api-error-codes";
import { BAD_REQUEST_CODE, HTTP_API_ERRORS, INTERNAL_ERROR_CODE } from "src/common/errors/http.errors";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";

/** Body this filter writes; same shape as the published `ApiErrorDto` contract. */
export type ErrorResponse = ApiErrorDto;

const errorCodeOf = (exception: HttpException): ApiErrorCode | undefined => {
  const response = exception.getResponse();
  if (typeof response !== "object" || !("code" in response)) return undefined;

  const code = response.code;
  if (typeof code !== "string") return undefined;
  if (!(code in API_ERROR_REGISTRY)) return undefined;

  return code as ApiErrorCode;
};

/** Status → HTTP generic code; unknown 5xx → INTERNAL_ERROR; other unmapped → BAD_REQUEST. */
const genericCodeForStatus = (statusCode: number): ApiErrorCode => {
  const match = Object.entries(HTTP_API_ERRORS).find(([, definition]) => Number(definition.status) === statusCode);
  if (match) return match[0] as ApiErrorCode;
  if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) return INTERNAL_ERROR_CODE;
  return BAD_REQUEST_CODE;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest<Request>()) as string;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | undefined;
    let code: ApiErrorCode | undefined;

    // Only expose message for HttpException (user-defined errors)
    // Unhandled errors are logged server-side but not exposed to clients for security
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      message = exception.message;
      code = errorCodeOf(exception);
    } else if (exception instanceof Error) {
      this.logger.error({ event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, err: exception }, "Unhandled exception");
    } else {
      this.logger.error(
        { event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, thrown: exception },
        "Unhandled non-Error exception",
      );
    }

    if (!code) {
      if (exception instanceof HttpException) {
        if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
          this.logger.error(
            { event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, err: exception, statusCode, path, message },
            "Uncoded 5xx HttpException",
          );
        } else {
          this.logger.debug(
            { statusCode, path, message },
            "Replacing uncoded HttpException message with catalog message",
          );
        }
      }
      code = genericCodeForStatus(statusCode);
      message = resolveApiErrorMessage(code);
    } else {
      message ??= resolveApiErrorMessage(code);
    }

    const responseBody: ErrorResponse = {
      message,
      code,
      meta: {
        timestamp: new Date().toISOString(),
        path,
      },
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
