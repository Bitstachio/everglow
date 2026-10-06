import i18n from "@/i18n/instance";
import type { ApiErrorDto } from "@/lib/api/generated";
import enErrors, { EN_ERROR_MESSAGE_DOMAINS } from "@/locales/en/errors/catalog";

export type ApiErrorCode = NonNullable<ApiErrorDto["code"]>;

/**
 * English domain catalogs — used for completeness checks and as the `errors`
 * i18n namespace source. Runtime lookups go through i18next so a future locale
 * can override copy without changing call sites.
 */
export const API_ERROR_MESSAGE_DOMAINS = EN_ERROR_MESSAGE_DOMAINS;

export const API_ERROR_MESSAGES = enErrors satisfies Record<ApiErrorCode, string>;

const isApiErrorCode = (code: string): code is ApiErrorCode => Object.hasOwn(API_ERROR_MESSAGES, code);

/**
 * Locale-aware product copy for a known API `code`. Unknown codes return
 * `undefined` so callers can fall back to a generic safe string.
 */
export const messageForApiErrorCode = (code: string | undefined): string | undefined => {
  if (code == null || !isApiErrorCode(code)) return undefined;
  return i18n.t(code, { ns: "errors" });
};
