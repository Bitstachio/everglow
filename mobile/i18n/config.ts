export const defaultLocale = "en" as const;

/** Registered app locales. Add a matching `locales/<code>/` tree when introducing a language. */
export const locales = [defaultLocale] as const;

export type AppLocale = (typeof locales)[number];

export const isAppLocale = (value: string): value is AppLocale =>
  (locales as readonly string[]).includes(value);
