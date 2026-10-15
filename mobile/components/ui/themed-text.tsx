import { type ReactNode } from "react";
import { Text, type TextProps } from "react-native";

export type TextTone = "strong" | "foreground" | "muted" | "subtle" | "accent" | "danger";

type ThemedTextProps = Omit<TextProps, "children"> & {
  children: ReactNode;
  className?: string;
  /** Semantic text color from theme tokens. Default: foreground. */
  tone?: TextTone;
};

const TONE_CLASSES: Record<TextTone, string> = {
  strong: "text-strong",
  foreground: "text-foreground",
  muted: "text-muted",
  subtle: "text-subtle",
  accent: "text-accent",
  danger: "text-danger",
};

// Funnel Sans unless the caller picks another family (font-display, font-mono, …).
const HAS_FAMILY = /\bfont-(display|sans|mono|hand)/;

export const ThemedText = ({ children, className = "", tone = "foreground", ...props }: ThemedTextProps) => (
  <Text
    className={[HAS_FAMILY.test(className) ? "" : "font-sans", TONE_CLASSES[tone], className].filter(Boolean).join(" ")}
    {...props}
  >
    {children}
  </Text>
);
