import en from "@/locales/en/messages";

import { locales } from "./config";

export const defaultNS = "common" as const;

export const ns = ["common", "errors", "start"] as const;

export const resources = {
  en: {
    common: en.common,
    errors: en.errors,
    start: en.start,
  },
} as const satisfies Record<(typeof locales)[number], Record<(typeof ns)[number], object>>;
