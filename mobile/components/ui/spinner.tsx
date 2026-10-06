import { colorTokens, type ColorTokenName } from "@/theme/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import i18n from "@/i18n/instance";
import { ActivityIndicator } from "react-native";

type SpinnerTone = "accent" | "muted" | "foreground" | "accentForeground";

type SpinnerProps = {
  size?: "small" | "large";
  /** Spoken name for assistive tech. Defaults to `common:actions.loading`. */
  label?: string;
  tone?: SpinnerTone;
};

const TONE_TO_TOKEN: Record<SpinnerTone, ColorTokenName> = {
  accent: "accent",
  muted: "muted",
  foreground: "foreground",
  accentForeground: "accentForeground",
};

export const Spinner = ({ size = "small", label, tone = "accent" }: SpinnerProps) => {
  const colorScheme = useColorScheme();
  const color = colorTokens[colorScheme][TONE_TO_TOKEN[tone]];
  const accessibilityLabel = label ?? i18n.t("actions.loading", { ns: "common" });

  return <ActivityIndicator accessibilityLabel={accessibilityLabel} size={size} color={color} />;
};
