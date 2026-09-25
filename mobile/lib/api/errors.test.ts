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

  it("keeps intentional 4xx messages", () => {
    const error = toApiError({
      response: {
        status: 403,
        data: { message: "Password changes are only available for email and password accounts." },
      },
    });

    expect(error.message).toBe("Password changes are only available for email and password accounts.");
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
  });

  it("maps network failures without a response", () => {
    const error = toApiError({ request: {} });
    expect(error.message).toBe("Network error. Please check your connection.");
  });
});

describe("getErrorMessage", () => {
  it("returns the Error message or the fallback", () => {
    expect(getErrorMessage(new Error("Offline"), "Please try again.")).toBe("Offline");
    expect(getErrorMessage("nope", "Please try again.")).toBe("Please try again.");
  });
});

describe("createApiError", () => {
  it("builds a named ApiError", () => {
    const error = createApiError("taken", { status: 409, code: "USERNAME_TAKEN" });
    expect(isApiError(error)).toBe(true);
    expect(error.status).toBe(409);
  });
});
