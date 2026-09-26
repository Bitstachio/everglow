export const locales = ["en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const localeSet = new Set<string>(locales);

export const isLocale = (value: string): value is Locale => localeSet.has(value);

export const isRtlLocale = (locale: string) => locale === "ar" || locale === "fa";
