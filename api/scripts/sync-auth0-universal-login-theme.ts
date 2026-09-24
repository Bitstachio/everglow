/**
 * Applies the Everglow Universal Login theme (and reset-password copy) to the
 * Auth0 tenant configured by AUTH0_DOMAIN + management credentials.
 *
 * Usage (from api/):
 *   npm run auth0:sync-theme
 *
 * Requires: AUTH0_DOMAIN, AUTH0_MANAGEMENT_CLIENT_ID, AUTH0_MANAGEMENT_CLIENT_SECRET
 * Optional: AUTH0_BRANDING_LOGO_URL
 *
 * Idempotent: GET default theme → merge our payload (preserve logo if unset) →
 * PATCH theme + tenant branding colors + merge custom text for reset-password.
 *
 * Does not enable Classic password reset. If the tenant still has
 * change_password.enabled, the theme will not paint the reset page — fix that
 * in the Auth0 dashboard (see mobile/docs/credential-changes.md §4.2).
 */

import { ManagementClient } from "auth0";
import { colorTokens } from "../../mobile/theme/tokens";
import {
  AUTH0_RESET_PASSWORD_COPY,
  buildAuth0TenantBrandingColors,
  buildAuth0UniversalLoginTheme,
} from "../../mobile/theme/auth0-universal-login";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

async function main(): Promise<void> {
  const domain = requireEnv("AUTH0_DOMAIN");
  const clientId = requireEnv("AUTH0_MANAGEMENT_CLIENT_ID");
  const clientSecret = requireEnv("AUTH0_MANAGEMENT_CLIENT_SECRET");
  const logoUrl = process.env.AUTH0_BRANDING_LOGO_URL;

  const client = new ManagementClient({ domain, clientId, clientSecret });

  const current = await client.branding.themes.getDefault();
  const theme = buildAuth0UniversalLoginTheme(colorTokens.light, {
    logoUrl: logoUrl ?? current.widget.logo_url ?? "",
  });

  await client.branding.themes.update(current.themeId, theme);
  console.log(`Updated Universal Login theme ${current.themeId}`);

  const brandingColors = buildAuth0TenantBrandingColors(colorTokens.light);
  await client.branding.update({
    colors: {
      primary: brandingColors.primary,
      page_background: brandingColors.page_background,
    },
  });
  console.log("Updated tenant branding colors");

  const prompt = "reset-password" as const;
  const language = "en" as const;
  const existingText = (await client.prompts.customText.get(prompt, language)) ?? {};
  await client.prompts.customText.set(prompt, language, {
    ...existingText,
    ...AUTH0_RESET_PASSWORD_COPY,
  });
  console.log("Merged reset-password custom text");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
