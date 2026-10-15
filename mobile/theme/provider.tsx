import { type ReactNode } from "react";
import { DarkTheme, ThemeProvider as NavigationThemeProvider, type Theme } from "expo-router";

import { colorTokens } from "./tokens";

type AppThemeProviderProps = {
  children: ReactNode;
};

// The app is dark only, so the navigation theme is built once from the palette.
const navigationTheme: Theme = {
  ...DarkTheme,
  fonts: {
    regular: { fontFamily: "FunnelSans-Regular", fontWeight: "normal" },
    medium: { fontFamily: "FunnelSans-Medium", fontWeight: "normal" },
    bold: { fontFamily: "FunnelSans-SemiBold", fontWeight: "normal" },
    heavy: { fontFamily: "FunnelDisplay-SemiBold", fontWeight: "normal" },
  },
  colors: {
    ...DarkTheme.colors,
    primary: colorTokens.accent,
    background: colorTokens.background,
    card: colorTokens.surface,
    text: colorTokens.foreground,
    border: colorTokens.border,
    notification: colorTokens.danger,
  },
};

export const AppThemeProvider = ({ children }: AppThemeProviderProps) => (
  <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
);
