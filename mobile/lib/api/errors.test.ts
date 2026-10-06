import { API_ERROR_MESSAGES } from "./error-messages";
import { createApiError, getErrorCode, getErrorMessage, isApiError, toApiError } from "./errors";

describe("toApiError", () => {
  it("hides 5xx response bodies from the UI", () => {
    const error = toApiError({
      response: {
        status: 500,
        data: { message: 'Failed to create Auth0 password-change ticket for "auth0|abc"' },
      },
    });

    expect(isApiError(error)).toBe(true);
    expect(error.message).toBe("Something went wrong. Please try again.");
    expect(error.status).toBe(500);
  });

  it("maps known 4xx codes to product copy instead of Nest messages", () => {
    const error = toApiError({
      response: {
        status: 409,
        data: { message: 'User with username "jane.doe" already exists', code: "USERNAME_TAKEN" },
      },
    });

    expect(error.message).toBe(API_ERROR_MESSAGES.USERNAME_TAKEN);
    expect(error.status).toBe(409);
    expect(error.code).toBe("USERNAME_TAKEN");
  });

  it("hides uncoded 4xx Nest messages behind a generic fallback", () => {
    const error = toApiError({
      response: {
        status: 403,
        data: { message: "Password changes are only available for email and password accounts." },
      },
    });

    expect(error.message).toBe("Something went wrong. Please try again.");
    expect(error.status).toBe(403);
  });

  it("preserves machine codes and Retry-After on 4xx", () => {
    const error = toApiError({
      response: {
        status: 429,
        data: { message: "Too many requests", code: "RATE_LIMIT_EXCEEDED" },
        headers: { "retry-after": "37" },
      },
    });

    expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.retryAfterSeconds).toBe(37);
    expect(getErrorCode(error)).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.message).toBe(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
  });

  it("maps network failures without a response", () => {
    const error = toApiError({ request: {} });
    expect(error.message).toBe("Network error. Please check your connection.");
  });
});

describe("getErrorMessage", () => {
  it("uses the fallback for non-ApiError throws", () => {
    expect(getErrorMessage(new Error("internal stack hint"), "Please try again.")).toBe("Please try again.");
    expect(getErrorMessage("nope", "Please try again.")).toBe("Please try again.");
  });

  it("reads the message already set on ApiError", () => {
    const error = toApiError({
      response: {
        status: 409,
        data: { message: 'User with username "jane.doe" already exists', code: "USERNAME_TAKEN" },
      },
    });
    expect(getErrorMessage(error)).toBe(API_ERROR_MESSAGES.USERNAME_TAKEN);
  });

  it("keeps 5xx on the generic string when the response includes a catalog code", () => {
    const error = toApiError({
      response: {
        status: 500,
        data: {
          message: 'Failed to create Auth0 password-change ticket for "auth0|abc"',
          code: "USERNAME_TAKEN",
        },
      },
    });

    expect(getErrorMessage(error)).toBe("Something went wrong. Please try again.");
    expect(error.code).toBe("USERNAME_TAKEN");
  });
});

describe("createApiError", () => {
  it("builds a named ApiError", () => {
    const error = createApiError("taken", { status: 409, code: "USERNAME_TAKEN" });
    expect(isApiError(error)).toBe(true);
    expect(error.status).toBe(409);
  });
});
