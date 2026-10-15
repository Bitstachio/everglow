import { colorTokens } from "./tokens";
import {
  AUTH0_INTER_FONT_URL,
  AUTH0_RESET_PASSWORD_COPY,
  buildAuth0TenantBrandingColors,
  buildAuth0UniversalLoginTheme,
} from "./auth0-universal-login";

describe("buildAuth0UniversalLoginTheme", () => {
  const theme = buildAuth0UniversalLoginTheme(colorTokens);

  it("maps the app tokens to Auth0 color fields from the credential-changes map", () => {
    expect(theme.colors).toMatchObject({
      input_background: colorTokens.background,
      widget_background: colorTokens.surface,
      header: colorTokens.strong,
      body_text: colorTokens.foreground,
      input_filled_text: colorTokens.foreground,
      secondary_button_label: colorTokens.foreground,
      input_labels_placeholders: colorTokens.muted,
      icons: colorTokens.muted,
      primary_button: colorTokens.accent,
      base_focus_color: colorTokens.accent,
      links_focused_components: colorTokens.accent,
      base_hover_color: colorTokens.accentHover,
      primary_button_label: colorTokens.accentForeground,
      widget_border: colorTokens.border,
      input_border: colorTokens.border,
      secondary_button_border: colorTokens.border,
      error: colorTokens.danger,
      success: colorTokens.success,
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
    const withLogo = buildAuth0UniversalLoginTheme(colorTokens, {
      logoUrl: "https://cdn.example/logo.png",
    });
    expect(withLogo.widget.logo_url).toBe("https://cdn.example/logo.png");
  });

  it("uses the app's page background for the hosted page", () => {
    expect(theme.page_background.background_color).toBe(colorTokens.background);
  });
});

describe("buildAuth0TenantBrandingColors", () => {
  it("sets primary and page background from the accent and background", () => {
    expect(buildAuth0TenantBrandingColors(colorTokens)).toEqual({
      primary: colorTokens.accent,
      page_background: colorTokens.background,
    });
  });
});

describe("AUTH0_RESET_PASSWORD_COPY", () => {
  it("rewrites the reset-password prompt in Everglow voice", () => {
    expect(AUTH0_RESET_PASSWORD_COPY["reset-password"].title).toBe("Choose a new password");
    expect(AUTH0_RESET_PASSWORD_COPY["reset-password"].buttonText).toBe("Update password");
  });
});
