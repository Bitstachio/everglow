import en from "@/locales/en/messages";

import { locales } from "./config";

export const defaultNS = "common" as const;

export const ns = [
  "common",
  "create",
  "envelope",
  "errors",
  "event",
  "home",
  "join",
  "onboarding",
  "report",
  "start",
  "you",
] as const;

export const resources = {
  en: {
    common: en.common,
    create: en.create,
    envelope: en.envelope,
    errors: en.errors,
    event: en.event,
    home: en.home,
    join: en.join,
    onboarding: en.onboarding,
    report: en.report,
    start: en.start,
    you: en.you,
  },
} as const satisfies Record<(typeof locales)[number], Record<(typeof ns)[number], object>>;
