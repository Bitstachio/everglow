/**
 * Color maps still imported by `components/ui/themed-text.tsx`.
 * App theme tokens live in `app/global.css` (+ `theme/tokens.ts` for native chrome).
 * Remove this file when shared UI migrates off `text-text-*` classes.
 */
export const textColors = {
  main: "#111827",
  muted: "#6B7280",
  subtle: "#9CA3AF",
  link: "#0A7EA4",
} as const;

export const darkTextColors = {
  main: "#F1F5F9",
  muted: "#FF0000",
  subtle: "#CBD5E1",
  link: "#0A7EA4",
} as const;
