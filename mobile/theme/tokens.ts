/**
 * Design tokens for props NativeWind can't style — React Navigation's theme,
 * icon and spinner colors. Class-based styling reads the same values from the
 * CSS custom properties in `app/global.css`; keep the two in sync.
 *
 * The app is dark only (the contact-sheet design, docs/theme.md). Both scheme
 * keys point at one palette so code that indexes by color scheme keeps working.
 */

const palette = {
  // Semantic names every screen already uses, mapped onto the film palette.
  background: "#0E0E0E",
  surface: "#151515",
  elevated: "#1B1B1B",

  strong: "#F4F4F4",
  foreground: "#F4F4F4",
  muted: "#A3A3A3",
  subtle: "#8A8A8A",

  accent: "#F4F4F4",
  accentHover: "#FFFFFF",
  accentActive: "#D4D4D4",
  accentForeground: "#0E0E0E",

  border: "#2E2E2E",
  borderMuted: "#1F1F1F",

  danger: "#FF4F6D",
  warning: "#F4F4F4",
  success: "#F4F4F4",

  // The contact sheet's own names (design system tokens).
  ground: "#0E0E0E",
  rebate: "#050505",
  sprocket: "#262626",
  frameEmpty: "#1B1B1B",
  sheet: "#151515",
  line: "#1F1F1F",
  text: "#F4F4F4",
  text2: "#A3A3A3",
  edge: "#8A8A8A",
  leader: "#F4F4F4",
  onLeader: "#0E0E0E",
  pencil: "#FF4F6D",
  stamp: "#E11D48",
  paper: "#EEE8DF",
  paperInk: "#1A1714",
  paperInk2: "#6B645C",
  paperRule: "#1A171438",
  inkBlue: "#1D2A6B",
  viewer: "#000000",
  outline: "#FFFFFF66",
  outlineSoft: "#FFFFFF2E",
} as const;

export const colorTokens = {
  light: palette,
  dark: palette,
} as const;

export type ColorSchemeName = keyof typeof colorTokens;
export type ColorTokenName = keyof typeof palette;

export const Colors = colorTokens;
