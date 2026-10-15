import { ThemedText } from "./themed-text";
import type { ReactNode } from "react";

type HeadingProps = {
  children: ReactNode;
  className?: string;
};

export const H1 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`font-display text-2xl ${className}`.trim()}>
    {children}
  </ThemedText>
);

export const H2 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`font-display text-xl ${className}`.trim()}>
    {children}
  </ThemedText>
);

export const H3 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`font-sans-semibold text-lg ${className}`.trim()}>
    {children}
  </ThemedText>
);
