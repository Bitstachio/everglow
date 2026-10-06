import { API_ERROR_MESSAGES } from "@/lib/api/error-messages";
import { defaultLocale } from "@/i18n/config";
import i18n, { resolveDeviceLocale } from "@/i18n/instance";
import { resources } from "@/i18n/resources";

describe("i18n instance", () => {
  it("initializes with English resources and a supported device locale", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(Object.keys(resources)).toContain(defaultLocale);
    expect(resolveDeviceLocale()).toBe(defaultLocale);
    expect(i18n.t("common:error.generic")).toBe("Something went wrong. Please try again.");
    expect(i18n.t("common:auth.login.title")).toBe("Welcome Back");
    expect(i18n.t("common:actions.back")).toBe("Back");
  });

  it("serves API error codes from the errors namespace", () => {
    expect(i18n.t("errors:USERNAME_TAKEN")).toBe(API_ERROR_MESSAGES.USERNAME_TAKEN);
    expect(i18n.t("errors:RATE_LIMIT_EXCEEDED")).toBe(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
  });
});
