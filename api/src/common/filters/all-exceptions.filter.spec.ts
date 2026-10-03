import {
  ArgumentsHost,
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
import { AllExceptionsFilter, ErrorResponse } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  const path = "/api/v2/users/me";

  let filter: AllExceptionsFilter;
  let reply: jest.Mock;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let host: ArgumentsHost;

  beforeEach(() => {
    reply = jest.fn();

    const httpAdapterHost = {
      httpAdapter: {
        getRequestUrl: jest.fn().mockReturnValue(path),
        reply,
      },
    } as unknown as HttpAdapterHost;

    host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: path }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    filter = new AllExceptionsFilter(httpAdapterHost);

    // Silence and observe logs without hitting the console.
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
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
    expect(debugSpy).toHaveBeenCalledWith(
      { statusCode: 404, path, message: "User not found" },
      "Replacing uncoded HttpException message with catalog message",
    );
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
  });
});
