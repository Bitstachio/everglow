import i18n from "@/i18n/instance";
import { messageForApiErrorCode } from "@/lib/api/error-messages";

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

const clientSafeError = (): string => i18n.t("error.generic", { ns: "common" });
const networkError = (): string => i18n.t("error.network", { ns: "common" });
const unexpectedError = (): string => i18n.t("error.unexpected", { ns: "common" });

const messageForHttpFailure = (status: number, code: string | undefined): string =>
  status >= 500 ? clientSafeError() : (messageForApiErrorCode(code) ?? clientSafeError());

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
 * i18n (`errors` namespace) — Nest response bodies are never shown (they often
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
    return createApiError(networkError(), { cause: error });
  }

  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createApiError(error.message, { cause: error });
  }

  return createApiError(err.message || unexpectedError(), { cause: error });
};

/**
 * Display string for an error. Known 4xx codes resolve through i18n at read
 * time so a locale change is reflected without recreating the error. 5xx stays
 * on the generic string even when the body includes a catalog code.
 */
export const getErrorMessage = (error: unknown, fallback?: string): string => {
  const resolvedFallback = fallback ?? unexpectedError();
  if (!isApiError(error)) return resolvedFallback;
  if (error.status != null && error.status >= 500) return clientSafeError();

  const fromCode = messageForApiErrorCode(error.code);
  if (fromCode != null) return fromCode;

  return error.message || resolvedFallback;
};
