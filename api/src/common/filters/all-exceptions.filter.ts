import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Request } from "express";
import { ApiErrorDto } from "src/common/errors/api-error.dto";
import { ApiErrorCode } from "src/common/errors/api-error-codes";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";

/** Body this filter writes; same shape as the published `ApiErrorDto` contract. */
export type ErrorResponse = ApiErrorDto;

const errorCodeOf = (exception: HttpException): ApiErrorCode | undefined => {
  const response = exception.getResponse();
  if (typeof response !== "object" || !("code" in response)) return undefined;

  return typeof response.code === "string" ? (response.code as ApiErrorCode) : undefined;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

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

    const responseBody: ErrorResponse = {
      ...(message && { message }),
      ...(code && { code }),
      meta: {
        timestamp: new Date().toISOString(),
        path: httpAdapter.getRequestUrl(ctx.getRequest<Request>()) as string,
      },
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
