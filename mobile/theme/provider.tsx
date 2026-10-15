import { type ReactNode } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme } from "expo-router";

import { useColorScheme } from "@/hooks/use-color-scheme";

import { Colors } from "./tokens";

type AppThemeProviderProps = {
  children: ReactNode;
};

const buildNavigationTheme = (scheme: "light" | "dark"): Theme => {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme];

  return {
    ...base,
    fonts: {
      regular: { fontFamily: "FunnelSans-Regular", fontWeight: "normal" },
      medium: { fontFamily: "FunnelSans-Medium", fontWeight: "normal" },
      bold: { fontFamily: "FunnelSans-SemiBold", fontWeight: "normal" },
      heavy: { fontFamily: "FunnelDisplay-SemiBold", fontWeight: "normal" },
    },
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.foreground,
      border: colors.border,
      notification: colors.danger,
    },
  };
};

export const AppThemeProvider = ({ children }: AppThemeProviderProps) => {
  const colorScheme = useColorScheme();

  return <NavigationThemeProvider value={buildNavigationTheme(colorScheme)}>{children}</NavigationThemeProvider>;
};
