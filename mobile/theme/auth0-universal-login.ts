import type { ColorTokenName } from "./tokens";

/**
 * Auth0 Universal Login theme derived from the app's light color tokens.
 * Source of truth: `app/global.css` light values, mirrored in `theme/tokens.ts`.
 * See mobile/docs/credential-changes.md §4.
 *
 * Auth0's theme API is a single palette (no dark mode). Always map light tokens.
 */

type LightColorTokens = Record<ColorTokenName, string>;

/** Public Inter woff used by the hosted Universal Login page. */
export const AUTH0_INTER_FONT_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.woff";

export type Auth0UniversalLoginTheme = {
  borders: {
    button_border_radius: number;
    button_border_weight: number;
    buttons_style: "rounded";
    input_border_radius: number;
    input_border_weight: number;
    inputs_style: "rounded";
    show_widget_shadow: boolean;
    widget_border_weight: number;
    widget_corner_radius: number;
  };
  colors: {
    base_focus_color: string;
    base_hover_color: string;
    body_text: string;
    error: string;
    header: string;
    icons: string;
    input_background: string;
    input_border: string;
    input_filled_text: string;
    input_labels_placeholders: string;
    links_focused_components: string;
    primary_button: string;
    primary_button_label: string;
    secondary_button_border: string;
    secondary_button_label: string;
    success: string;
    widget_background: string;
    widget_border: string;
  };
  fonts: {
    body_text: { bold: boolean; size: number };
    buttons_text: { bold: boolean; size: number };
    font_url: string;
    input_labels: { bold: boolean; size: number };
    links: { bold: boolean; size: number };
    links_style: "normal";
    reference_text_size: number;
    subtitle: { bold: boolean; size: number };
    title: { bold: boolean; size: number };
  };
  page_background: {
    background_color: string;
    background_image_url: string;
    page_layout: "center";
  };
  widget: {
    header_text_alignment: "center";
    logo_height: number;
    logo_position: "center";
    logo_url: string;
    social_buttons_layout: "bottom";
  };
};

export type Auth0TenantBrandingColors = {
  primary: string;
  page_background: string;
};

/** Everglow voice for the hosted reset-password prompt. */
export const AUTH0_RESET_PASSWORD_COPY = {
  "reset-password": {
    title: "Choose a new password",
    description: "Enter a new password for your Everglow account.",
    buttonText: "Update password",
    passwordPlaceholder: "New password",
    "error-password-mismatch": "Those passwords do not match. Try again.",
    "error-password-too-weak": "Choose a stronger password.",
  },
} as const;

/**
 * Builds a full Auth0 theme body from light app tokens. A PATCH must include
 * every top-level section; callers should replace the default theme wholesale
 * with this payload (optionally preserving logo_url from the current theme).
 */
export const buildAuth0UniversalLoginTheme = (
  light: LightColorTokens,
  options?: { logoUrl?: string; fontUrl?: string },
): Auth0UniversalLoginTheme => ({
  borders: {
    button_border_radius: 16,
    button_border_weight: 1,
    buttons_style: "rounded",
    input_border_radius: 16,
    input_border_weight: 1,
    inputs_style: "rounded",
    show_widget_shadow: false,
    widget_border_weight: 1,
    widget_corner_radius: 16,
  },
  colors: {
    base_focus_color: light.accent,
    base_hover_color: light.accentHover,
    body_text: light.foreground,
    error: light.danger,
    header: light.strong,
    icons: light.muted,
    input_background: light.background,
    input_border: light.border,
    input_filled_text: light.foreground,
    input_labels_placeholders: light.muted,
    links_focused_components: light.accent,
    primary_button: light.accent,
    primary_button_label: light.accentForeground,
    secondary_button_border: light.border,
    secondary_button_label: light.foreground,
    success: light.success,
    widget_background: light.surface,
    widget_border: light.border,
  },
  fonts: {
    font_url: options?.fontUrl ?? AUTH0_INTER_FONT_URL,
    reference_text_size: 16,
    body_text: { bold: false, size: 87.5 },
    buttons_text: { bold: true, size: 100 },
    input_labels: { bold: false, size: 100 },
    links: { bold: false, size: 87.5 },
    links_style: "normal",
    subtitle: { bold: false, size: 87.5 },
    title: { bold: true, size: 150 },
  },
  page_background: {
    background_color: light.background,
    background_image_url: "",
    page_layout: "center",
  },
  widget: {
    header_text_alignment: "center",
    logo_height: 52,
    logo_position: "center",
    logo_url: options?.logoUrl ?? "",
    social_buttons_layout: "bottom",
  },
});

export const buildAuth0TenantBrandingColors = (light: LightColorTokens): Auth0TenantBrandingColors => ({
  primary: light.accent,
  page_background: light.background,
});
