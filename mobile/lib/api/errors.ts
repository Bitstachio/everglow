export const toApiError = (error: unknown): Error => {
  const err = error as {
    response?: { data?: { message?: string | string[]; error?: string } };
    request?: unknown;
    message?: string;
  };

  if (err.response) {
    const message = err.response.data?.message || err.response.data?.error || "An error occurred";
    return new Error(Array.isArray(message) ? message.join(", ") : message);
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
