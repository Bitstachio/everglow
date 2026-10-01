import { messageForApiErrorCode } from "@/lib/api/error-messages";

const CLIENT_SAFE_SERVER_ERROR = "Something went wrong. Please try again.";
const CLIENT_SAFE_CLIENT_ERROR = "Something went wrong. Please try again.";

type ApiErrorShape = {
  response?: {
    status?: number;
    data?: { message?: string | string[]; error?: string; code?: string };
    headers?: Record<string, unknown>;
  };
  request?: unknown;
  message?: string;
};

export type ApiError = Error & {
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
};

const headerValue = (headers: Record<string, unknown> | undefined, name: string): string | undefined => {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct) && typeof direct[0] === "string") return direct[0];
  return undefined;
};

const parseRetryAfterSeconds = (headers: Record<string, unknown> | undefined): number | undefined => {
  const raw = headerValue(headers, "retry-after");
  if (raw == null) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
};

const messageForHttpFailure = (status: number, code: string | undefined): string => {
  if (status >= 500) return CLIENT_SAFE_SERVER_ERROR;
  return messageForApiErrorCode(code) ?? CLIENT_SAFE_CLIENT_ERROR;
};

/** Transport/API failure with optional status, machine code, and Retry-After. */
export const createApiError = (
  message: string,
  options?: { status?: number; code?: string; retryAfterSeconds?: number; cause?: unknown },
): ApiError => {
  const error = new Error(message, options?.cause !== undefined ? { cause: options.cause } : undefined) as ApiError;
  error.name = "ApiError";
  error.status = options?.status;
  error.code = options?.code;
  error.retryAfterSeconds = options?.retryAfterSeconds;
  return error;
};

export const isApiError = (error: unknown): error is ApiError => error instanceof Error && error.name === "ApiError";

export const getErrorCode = (error: unknown): string | undefined => (isApiError(error) ? error.code : undefined);

/**
 * Maps transport failures into Error instances. UI copy comes from `code` via
 * `messageForApiErrorCode` — Nest response bodies are never shown (they often
 * include ids and internal detail). Status, `code`, and `Retry-After` are
 * preserved on ApiError so callers can branch.
 */
export const toApiError = (error: unknown): ApiError => {
  const err = error as ApiErrorShape;

  if (err.response) {
    const status = err.response.status ?? 0;
    const code = typeof err.response.data?.code === "string" ? err.response.data.code : undefined;
    const retryAfterSeconds = parseRetryAfterSeconds(err.response.headers);
    const message = messageForHttpFailure(status, code);
    return createApiError(message, { status, code, retryAfterSeconds, cause: error });
  }

  if (err.request) {
    return createApiError("Network error. Please check your connection.", { cause: error });
  }

  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createApiError(error.message, { cause: error });
  }

  return createApiError(err.message || "An unexpected error occurred", { cause: error });
};

/** Prefers mapped copy for ApiError codes; otherwise Error.message or fallback. */
export const getErrorMessage = (error: unknown, fallback = "An unexpected error occurred"): string => {
  if (isApiError(error)) {
    return messageForApiErrorCode(error.code) ?? error.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
