import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";
import { routing } from "./routing";

const messageLoaders = {
  en: () => import("@/messages/en"),
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : defaultLocale;

  const messages = (await messageLoaders[locale]()).default;

  return {
    locale,
    messages,
  };
});
