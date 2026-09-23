import { ThemedText } from "./themed-text";
import type { ReactNode } from "react";

type HeadingProps = {
  children: ReactNode;
  className?: string;
};

export const H1 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`text-2xl font-bold ${className}`.trim()}>
    {children}
  </ThemedText>
);

export const H2 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`text-xl font-bold ${className}`.trim()}>
    {children}
  </ThemedText>
);

export const H3 = ({ children, className = "" }: HeadingProps) => (
  <ThemedText accessibilityRole="header" tone="strong" className={`text-lg font-semibold ${className}`.trim()}>
    {children}
  </ThemedText>
);
