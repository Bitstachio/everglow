import { type ReactNode } from "react";
import { Text, type TextProps } from "react-native";

type DisplayVariant = "event" | "screen" | "roll";

type DisplayProps = Omit<TextProps, "children"> & {
  children: ReactNode;
  /** Event title over a cover, screen title, or a roll's name on Home. Default: screen. */
  variant?: DisplayVariant;
  /** A second line in the secondary text colour, as in "Both rolls / are in use." */
  dim?: ReactNode;
  className?: string;
};

const VARIANT_CLASSES: Record<DisplayVariant, string> = {
  event: "text-title-event",
  screen: "text-title-screen",
  roll: "text-title-roll",
};

/** Names and titles in Funnel Display. Screen titles are headers for assistive tech. */
export const Display = ({ children, variant = "screen", dim, className = "", ...props }: DisplayProps) => (
  <Text
    accessibilityRole={variant === "roll" ? undefined : "header"}
    className={`font-display text-text ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    {...props}
  >
    {children}
    {dim ? (
      <Text className="text-text-2">
        {`\n`}
        {dim}
      </Text>
    ) : null}
  </Text>
);

/** The name alone, in the header. No mark beside it. */
export const Wordmark = ({ className = "" }: { className?: string }) => (
  <Text accessibilityRole="header" className={`font-display text-wordmark text-text ${className}`.trim()}>
    Everglow
  </Text>
);
