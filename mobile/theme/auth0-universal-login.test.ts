import { colorTokens } from "./tokens";
import {
  AUTH0_INTER_FONT_URL,
  AUTH0_RESET_PASSWORD_COPY,
  buildAuth0TenantBrandingColors,
  buildAuth0UniversalLoginTheme,
} from "./auth0-universal-login";

describe("buildAuth0UniversalLoginTheme", () => {
  const theme = buildAuth0UniversalLoginTheme(colorTokens.light);

  it("maps light tokens to Auth0 color fields from the credential-changes map", () => {
    expect(theme.colors).toMatchObject({
      input_background: colorTokens.light.background,
      widget_background: colorTokens.light.surface,
      header: colorTokens.light.strong,
      body_text: colorTokens.light.foreground,
      input_filled_text: colorTokens.light.foreground,
      secondary_button_label: colorTokens.light.foreground,
      input_labels_placeholders: colorTokens.light.muted,
      icons: colorTokens.light.muted,
      primary_button: colorTokens.light.accent,
      base_focus_color: colorTokens.light.accent,
      links_focused_components: colorTokens.light.accent,
      base_hover_color: colorTokens.light.accentHover,
      primary_button_label: colorTokens.light.accentForeground,
      widget_border: colorTokens.light.border,
      input_border: colorTokens.light.border,
      secondary_button_border: colorTokens.light.border,
      error: colorTokens.light.danger,
      success: colorTokens.light.success,
    });
  });

  it("uses the app control radius and rounded style, not Auth0 defaults", () => {
    expect(theme.borders).toMatchObject({
      button_border_radius: 16,
      input_border_radius: 16,
      widget_corner_radius: 16,
      buttons_style: "rounded",
      inputs_style: "rounded",
      widget_border_weight: 1,
      input_border_weight: 1,
      show_widget_shadow: false,
    });
  });

  it("points fonts at Inter and 16px body reference size", () => {
    expect(theme.fonts.font_url).toBe(AUTH0_INTER_FONT_URL);
    expect(theme.fonts.reference_text_size).toBe(16);
  });

  it("preserves an existing logo URL when provided", () => {
    const withLogo = buildAuth0UniversalLoginTheme(colorTokens.light, {
      logoUrl: "https://cdn.example/logo.png",
    });
    expect(withLogo.widget.logo_url).toBe("https://cdn.example/logo.png");
  });

  it("does not use dark tokens for the hosted theme", () => {
    expect(theme.colors.primary_button).not.toBe(colorTokens.dark.accent);
    expect(theme.page_background.background_color).toBe(colorTokens.light.background);
  });
});

describe("buildAuth0TenantBrandingColors", () => {
  it("sets primary and page background from light accent and background", () => {
    expect(buildAuth0TenantBrandingColors(colorTokens.light)).toEqual({
      primary: colorTokens.light.accent,
      page_background: colorTokens.light.background,
    });
  });
});

describe("AUTH0_RESET_PASSWORD_COPY", () => {
  it("rewrites the reset-password prompt in Everglow voice", () => {
    expect(AUTH0_RESET_PASSWORD_COPY["reset-password"].title).toBe("Choose a new password");
    expect(AUTH0_RESET_PASSWORD_COPY["reset-password"].buttonText).toBe("Update password");
  });
});
