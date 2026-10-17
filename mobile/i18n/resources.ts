import en from "@/locales/en/messages";

import { locales } from "./config";

export const defaultNS = "common" as const;

export const ns = ["common", "errors", "home", "onboarding", "start", "you"] as const;

export const resources = {
  en: {
    common: en.common,
    errors: en.errors,
    home: en.home,
    onboarding: en.onboarding,
    start: en.start,
    you: en.you,
  },
} as const satisfies Record<(typeof locales)[number], Record<(typeof ns)[number], object>>;
