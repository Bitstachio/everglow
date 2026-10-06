import { defaultLocale } from "@/i18n/config";
import i18n, { resolveDeviceLocale } from "@/i18n/instance";
import { resources } from "@/i18n/resources";

describe("i18n instance", () => {
  it("initializes with English resources and a supported device locale", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(Object.keys(resources)).toContain(defaultLocale);
    expect(resolveDeviceLocale()).toBe(defaultLocale);
    expect(i18n.t("common:error.generic")).toBe("Something went wrong. Please try again.");
  });
});
