import "i18next";

import type en from "@/locales/en/messages";

import type { defaultNS } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: {
      common: typeof en.common;
      create: typeof en.create;
      envelope: typeof en.envelope;
      errors: typeof en.errors;
      home: typeof en.home;
      join: typeof en.join;
      onboarding: typeof en.onboarding;
      start: typeof en.start;
      you: typeof en.you;
    };
  }
}
