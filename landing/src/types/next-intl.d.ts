import messages from "@/messages/en";
import { locales } from "@/i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: typeof messages;
  }
}
