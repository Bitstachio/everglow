import { ArgumentsHost, Logger, NotFoundException } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { AllExceptionsFilter, ErrorResponse } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  const path = "/api/v2/users/me";

  let filter: AllExceptionsFilter;
  let reply: jest.Mock;
  let errorSpy: jest.SpyInstance;
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

    // Silence and observe the catch-all error log without hitting the console.
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const replyArgs = (): { body: ErrorResponse; statusCode: number } => {
    const [, body, statusCode] = reply.mock.calls[0] as [unknown, ErrorResponse, number];
    return { body, statusCode };
  };

  it("exposes the message for an HttpException without logging (ingress already records 4xx)", () => {
    filter.catch(new NotFoundException("User not found"), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(404);
    expect(body.message).toBe("User not found");
    expect(body.meta.path).toBe(path);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a single error and returns a sanitized 500 for an unhandled Error", () => {
    filter.catch(new Error("connection pool exhausted"), host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(500);
    // Internal failure detail must never leak to the client.
    expect(body.message).toBeUndefined();
    expect(body.meta.path).toBe(path);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload] = errorSpy.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ event: "request.unhandled_error" });
  });

  it("logs a single error and returns a sanitized 500 for a non-Error throw", () => {
    filter.catch("boom", host);

    const { body, statusCode } = replyArgs();
    expect(statusCode).toBe(500);
    expect(body.message).toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload] = errorSpy.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ event: "request.unhandled_error", thrown: "boom" });
  });
});
