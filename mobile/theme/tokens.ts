/**
 * Design tokens for props NativeWind can't style — React Navigation's theme,
 * icon and spinner colors. Class-based styling reads the same values from the
 * CSS custom properties in `app/global.css`; keep the two in sync.
 */

export const colorTokens = {
  light: {
    background: "#FFFFFF",
    surface: "#F8FAFC",
    elevated: "#FFFFFF",

    strong: "#0F172A",
    foreground: "#1E293B",
    muted: "#64748B",
    subtle: "#94A3B8",

    accent: "#4F46E5",
    accentHover: "#4338CA",
    accentActive: "#3730A3",
    accentForeground: "#FFFFFF",

    border: "#E2E8F0",
    borderMuted: "#F1F5F9",

    danger: "#DC2626",
    warning: "#D97706",
    success: "#16A34A",
  },
  dark: {
    background: "#0B1220",
    surface: "#111827",
    elevated: "#1F2937",

    strong: "#F8FAFC",
    foreground: "#E2E8F0",
    muted: "#94A3B8",
    subtle: "#64748B",

    accent: "#818CF8",
    accentHover: "#A5B4FC",
    accentActive: "#6366F1",
    accentForeground: "#0F172A",

    border: "#334155",
    borderMuted: "#1E293B",

    danger: "#F87171",
    warning: "#FBBF24",
    success: "#4ADE80",
  },
} as const;

export type ColorSchemeName = keyof typeof colorTokens;
export type ColorTokenName = keyof (typeof colorTokens)["light"];

export const Colors = colorTokens;
