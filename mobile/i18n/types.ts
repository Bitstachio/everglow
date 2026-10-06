import "i18next";

import type en from "@/locales/en/messages";

import type { defaultNS } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: {
      common: typeof en.common;
      errors: typeof en.errors;
    };
  }
}
