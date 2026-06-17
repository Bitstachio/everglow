import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Request } from "express";

export type ErrorResponse = {
  message?: string;
  meta: {
    timestamp: string;
    path: string;
  };
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

    // Only expose message for HttpException (user-defined errors)
    // Unhandled errors are logged server-side but not exposed to clients for security
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Error) {
      this.logger.error({ event: "request.unhandled_error", err: exception }, "Unhandled exception");
    } else {
      this.logger.error({ event: "request.unhandled_error", thrown: exception }, "Unhandled non-Error exception");
    }

    const responseBody: ErrorResponse = {
      ...(message && { message }),
      meta: {
        timestamp: new Date().toISOString(),
        path: httpAdapter.getRequestUrl(ctx.getRequest<Request>()) as string,
      },
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
