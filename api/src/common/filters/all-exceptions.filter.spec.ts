import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { RateLimitExceededException } from "../rate-limit/rate-limit.exception";
import { HttpAdapterHost } from "@nestjs/core";
import {
  BAD_REQUEST_CODE,
  INTERNAL_ERROR_CODE,
  NOT_FOUND_CODE,
  UNPROCESSABLE_ENTITY_CODE,
} from "../errors/http.errors";
import { resolveApiErrorMessage } from "../errors/api-error-codes";
import { ALERT_EVENTS } from "../logging/alert-events.constants";
import { errorLogFieldsOf } from "../logging/error-log-fields";
import { AllExceptionsFilter, ErrorResponse } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  const path = "/api/v2/users/me";

  let filter: AllExceptionsFilter;
  let reply: jest.Mock;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let host: ArgumentsHost;
  let response: object;

  beforeEach(() => {
    reply = jest.fn();
    response = {};

    const httpAdapterHost = {
      httpAdapter: {
        getRequestUrl: jest.fn().mockReturnValue(path),
        reply,
      },
    } as unknown as HttpAdapterHost;

    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: "POST", url: path }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    filter = new AllExceptionsFilter(httpAdapterHost);

    // Silence and observe the filter's own logs without hitting the console.
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    debugSpy = jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const replyArgs = (): { body: ErrorResponse; statusCode: number } => {
    const [, body, statusCode] = reply.mock.calls[0] as [unknown, ErrorResponse, number];
    return { body, statusCode };
  };

  it("fills a generic catalog code and registry message for an uncoded HttpException", () => {
    filter.catch(new NotFoundException("User not found"), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(404);
    expect(body).toEqual({
      message: resolveApiErrorMessage(NOT_FOUND_CODE),
      code: NOT_FOUND_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    // What the client doesn't see goes to the request's log line instead.
    expect(errorLogFieldsOf(response)).toEqual({ errorCode: NOT_FOUND_CODE, errorReason: "User not found" });
  });

  it("records a validation failure's field errors as the reason, and sends the client only BAD_REQUEST", () => {
    filter.catch(
      new BadRequestException(["title must be shorter than or equal to 100 characters", "date must be a valid date"]),
      host,
    );

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(400);
    expect(body).toMatchObject({ code: BAD_REQUEST_CODE, message: resolveApiErrorMessage(BAD_REQUEST_CODE) });
    expect(errorLogFieldsOf(response)).toEqual({
      errorCode: BAD_REQUEST_CODE,
      errorReason: "title must be shorter than or equal to 100 characters; date must be a valid date",
    });
  });

  it("keeps the recorded reason to one short line", () => {
    filter.catch(new HttpException(`first line\nsecond line ${"x".repeat(600)}`, 400), host);

    expect(errorLogFieldsOf(response)?.errorReason).toBe("first line");

    filter.catch(new HttpException("y".repeat(600), 400), host);

    expect(errorLogFieldsOf(response)?.errorReason).toBe(`${"y".repeat(500)}…`);
  });

  it("maps unmapped 4xx statuses to BAD_REQUEST so every response carries a code", () => {
    filter.catch(new HttpException("I'm a teapot", 418), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(418);
    expect(body).toEqual({
      message: resolveApiErrorMessage(BAD_REQUEST_CODE),
      code: BAD_REQUEST_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });
  });

  it("maps UnprocessableEntity to UNPROCESSABLE_ENTITY", () => {
    filter.catch(new UnprocessableEntityException("Onboarding is incomplete"), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(422);
    expect(body).toEqual({
      message: resolveApiErrorMessage(UNPROCESSABLE_ENTITY_CODE),
      code: UNPROCESSABLE_ENTITY_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });
  });

  it("surfaces a machine-readable code and nothing else from a coded HttpException", () => {
    filter.catch(new RateLimitExceededException(), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(429);
    expect(body).toEqual({
      message: resolveApiErrorMessage("RATE_LIMIT_EXCEEDED"),
      code: "RATE_LIMIT_EXCEEDED",
      meta: { timestamp: expect.any(String) as string, path },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorLogFieldsOf(response)).toEqual({
      errorCode: "RATE_LIMIT_EXCEEDED",
      errorReason: resolveApiErrorMessage("RATE_LIMIT_EXCEEDED"),
    });
  });

  it("logs a single error and returns a sanitized 500 with INTERNAL_ERROR for an unhandled Error", () => {
    filter.catch(new Error("connection pool exhausted"), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(500);
    expect(body).toEqual({
      message: resolveApiErrorMessage(INTERNAL_ERROR_CODE),
      code: INTERNAL_ERROR_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload] = errorSpy.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ event: "request.unhandled_error" });
    expect(errorLogFieldsOf(response)).toEqual({
      errorCode: INTERNAL_ERROR_CODE,
      errorReason: "Error: connection pool exhausted",
    });
  });

  describe("an Express or body-parser error that Nest passes through", () => {
    /** Shaped like body-parser's: an `http-errors` object, exposed when it's a 4xx. */
    const httpError = (status: number, name: string, message: string) =>
      Object.assign(new Error(message), { name, status, statusCode: status, expose: status < 500 });

    it("keeps a client error's 4xx status, logs no unhandled error, and logs the request at warn", () => {
      filter.catch(httpError(413, "PayloadTooLargeError", "request entity too large"), host);

      const { body, statusCode } = replyArgs();
      expect(statusCode).toBe(413);
      expect(body).toMatchObject({ code: BAD_REQUEST_CODE, message: resolveApiErrorMessage(BAD_REQUEST_CODE) });
      expect(errorSpy).not.toHaveBeenCalled();
      // The access log never saw the request, so this line is its only record.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        {
          event: "request.body_rejected",
          method: "POST",
          path,
          statusCode: 413,
          errorCode: BAD_REQUEST_CODE,
          errorReason: "PayloadTooLargeError: request entity too large",
        },
        "Request body rejected",
      );
      expect(errorLogFieldsOf(response)).toEqual({
        errorCode: BAD_REQUEST_CODE,
        errorReason: "PayloadTooLargeError: request entity too large",
      });
    });

    it("still treats a 5xx one as unhandled", () => {
      filter.catch(httpError(500, "InternalServerError", "stream encoding should not be set"), host);

      expect(replyArgs().statusCode).toBe(500);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("doesn't trust a status the error doesn't expose to the client", () => {
      filter.catch(Object.assign(new Error("NoSuchKey"), { status: 404 }), host);

      expect(replyArgs().statusCode).toBe(500);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("logs an uncoded 5xx HttpException at error like an unhandled throw", () => {
    const exception = new InternalServerErrorException("Plan missing");
    filter.catch(exception, host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(500);
    expect(body).toEqual({
      message: resolveApiErrorMessage(INTERNAL_ERROR_CODE),
      code: INTERNAL_ERROR_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });

    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      {
        event: ALERT_EVENTS.REQUEST_UNHANDLED_ERROR,
        err: exception,
        statusCode: 500,
        path,
        message: "Plan missing",
      },
      "Uncoded 5xx HttpException",
    );
    expect(errorLogFieldsOf(response)).toEqual({ errorCode: INTERNAL_ERROR_CODE, errorReason: "Plan missing" });
  });

  it("logs a single error and returns INTERNAL_ERROR for a non-Error throw", () => {
    filter.catch("boom", host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(500);
    expect(body).toEqual({
      message: resolveApiErrorMessage(INTERNAL_ERROR_CODE),
      code: INTERNAL_ERROR_CODE,
      meta: { timestamp: expect.any(String) as string, path },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload] = errorSpy.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ event: "request.unhandled_error", thrown: "boom" });
    expect(errorLogFieldsOf(response)).toEqual({
      errorCode: INTERNAL_ERROR_CODE,
      errorReason: "Non-Error thrown: boom",
    });
  });
});
