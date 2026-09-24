import { getErrorMessage, toApiError } from "./errors";

describe("toApiError", () => {
  it("hides 5xx response bodies from the UI", () => {
    const error = toApiError({
      response: {
        status: 500,
        data: { message: 'Failed to create Auth0 password-change ticket for "auth0|abc"' },
      },
    });

    expect(error.message).toBe("Something went wrong. Please try again.");
  });

  it("keeps intentional 4xx messages", () => {
    const error = toApiError({
      response: {
        status: 403,
        data: { message: "Password changes are only available for email and password accounts." },
      },
    });

    expect(error.message).toBe("Password changes are only available for email and password accounts.");
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
