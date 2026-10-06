import i18n, { defaultLocale, resolveDeviceLocale, resources } from "@/i18n";

describe("i18n", () => {
  it("initializes with English resources and a supported device locale", () => {
    expect(i18n.isInitialized).toBe(true);
    expect(Object.keys(resources)).toContain(defaultLocale);
    expect(resolveDeviceLocale()).toBe(defaultLocale);
    expect(i18n.t("common:error.generic")).toBe("Something went wrong. Please try again.");
  });
});
