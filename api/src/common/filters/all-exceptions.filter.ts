import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Request } from "express";
import { ApiErrorDto } from "src/common/errors/api-error.dto";
import { API_ERROR_REGISTRY, resolveApiErrorMessage, type ApiErrorCode } from "src/common/errors/api-error-codes";
import {
  BAD_REQUEST_CODE,
  HTTP_API_ERRORS,
  INTERNAL_ERROR_CODE,
  type HttpApiErrorCode,
} from "src/common/errors/http.errors";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { recordErrorLogFields } from "src/common/logging/error-log-fields";

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

/** Longest reason kept for the log line: a validation failure can list many fields. */
const MAX_REASON_LENGTH = 500;

/**
 * Why the request failed, in words for our logs and never for the client: a
 * validation failure's field errors, or the exception's own message (the
 * catalogue message of an `ApiException`, a `RESPONSE_TEMPLATES` message, or a
 * bare exception's status text). One line, kept short.
 */
const reasonOf = (exception: unknown): string => {
  let reason: string;
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const fieldErrors = typeof response === "object" ? (response as { message?: unknown }).message : undefined;
    reason = Array.isArray(fieldErrors) ? fieldErrors.map(String).join("; ") : exception.message;
  } else if (exception instanceof Error) {
    reason = `${exception.name}: ${exception.message}`;
  } else {
    reason = `Non-Error thrown: ${String(exception)}`;
  }
  const [firstLine] = reason.split("\n", 1);
  return firstLine.length > MAX_REASON_LENGTH ? `${firstLine.slice(0, MAX_REASON_LENGTH)}…` : firstLine;
};

/**
 * The 4xx status of a client error Nest passes through as it is. Nest turns a
 * JSON syntax error into a `BadRequestException`, but a body over the size
 * limit (413), a charset or encoding the parser can't read (415), or an upload
 * the client dropped (400) arrives as an `http-errors` object. `expose` marks
 * one made for the client, unlike a library error that only has a `status`.
 */
const clientErrorStatusOf = (exception: unknown): number | undefined => {
  if (!(exception instanceof Error)) return undefined;

  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  const isClientStatus = typeof status === "number" && status >= 400 && status < 500;
  return isClientStatus && expose === true ? status : undefined;
};

/** Status → HTTP generic code; unknown 5xx → INTERNAL_ERROR; other unmapped → BAD_REQUEST. */
const genericCodeForStatus = (statusCode: number): HttpApiErrorCode => {
  const match = Object.entries(HTTP_API_ERRORS).find(([, definition]) => Number(definition.status) === statusCode);
  if (match) return match[0] as HttpApiErrorCode;
  if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) return INTERNAL_ERROR_CODE;
  return BAD_REQUEST_CODE;
};

/** What the client gets: the catalogue code and its catalogue message. */
interface ClientError {
  code: ApiErrorCode;
  message: string;
}

const genericErrorFor = (statusCode: number): ClientError => {
  const code = genericCodeForStatus(statusCode);
  return { code, message: resolveApiErrorMessage(code) };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest<Request>()) as string;

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let catalogued: ClientError | undefined;
    const clientErrorStatus = clientErrorStatusOf(exception);

    // Clients get the catalogue code and its copy, never an exception's own
    // message. What went wrong goes to the logs instead: the code and reason on
    // the request's completion line for every error, plus an error line with
    // the stack for a 5xx.
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const code = errorCodeOf(exception);
      // An ApiException's message is already its catalogue message, params included.
      if (code) catalogued = { code, message: exception.message };
    } else if (clientErrorStatus) {
      // The client's mistake, so no unhandled-error line.
      statusCode = clientErrorStatus;
    } else if (exception instanceof Error) {
      this.logger.error({ event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, err: exception }, "Unhandled exception");
    } else {
      this.logger.error(
        { event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, thrown: exception },
        "Unhandled non-Error exception",
      );
    }

    if (!catalogued && exception instanceof HttpException && statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        { event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR, err: exception, statusCode, path, message: exception.message },
        "Uncoded 5xx HttpException",
      );
    }

    const { code, message } = catalogued ?? genericErrorFor(statusCode);
    const errorReason = reasonOf(exception);
    recordErrorLogFields(ctx.getResponse<object>(), { errorCode: code, errorReason });
    if (clientErrorStatus) {
      // The body parser runs before the access log's middleware, so a request
      // it refuses gets no completion line: this line is its only record.
      this.logger.warn(
        {
          event: "request.body_rejected",
          method: ctx.getRequest<Request>().method,
          path,
          statusCode,
          errorCode: code,
          errorReason,
        },
        "Request body rejected",
      );
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
