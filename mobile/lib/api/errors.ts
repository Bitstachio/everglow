const CLIENT_SAFE_SERVER_ERROR = "Something went wrong. Please try again.";

type ApiErrorShape = {
  response?: { status?: number; data?: { message?: string | string[]; error?: string } };
  request?: unknown;
  message?: string;
};

const messageFromResponse = (data: ApiErrorShape["response"]): string | undefined => {
  const raw = data?.data?.message ?? data?.data?.error;
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw.join(", ") : raw;
};

/**
 * Maps transport failures into Error instances. 5xx bodies often contain
 * internal details (Auth0 ids, stack hints) — never surface those to the UI.
 * 4xx messages are treated as intentional client-facing copy.
 */
export const toApiError = (error: unknown): Error => {
  const err = error as ApiErrorShape;

  if (err.response) {
    const status = err.response.status ?? 0;
    if (status >= 500) {
      return new Error(CLIENT_SAFE_SERVER_ERROR);
    }

    const message = messageFromResponse(err.response) || "An error occurred";
    return new Error(message);
  }

  if (err.request) {
    return new Error("Network error. Please check your connection.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(err.message || "An unexpected error occurred");
};

export const getErrorMessage = (error: unknown, fallback = "An unexpected error occurred"): string =>
  error instanceof Error ? error.message : fallback;
