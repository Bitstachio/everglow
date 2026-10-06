import * as Localization from "expo-localization";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { defaultLocale, isAppLocale } from "./config";
import { defaultNS, ns, resources } from "./resources";
import "./types";

/** Prefer the first device language we ship; otherwise fall back to English. */
export const resolveDeviceLocale = (): string => {
  for (const locale of Localization.getLocales()) {
    const languageCode = locale.languageCode;
    if (languageCode && isAppLocale(languageCode)) {
      return languageCode;
    }
  }
  return defaultLocale;
};

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLocale(),
  fallbackLng: defaultLocale,
  supportedLngs: Object.keys(resources),
  ns: [...ns],
  defaultNS,
  interpolation: {
    // React already escapes interpolated values.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
