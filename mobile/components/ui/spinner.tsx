import { colorTokens, type ColorTokenName } from "@/theme/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ActivityIndicator } from "react-native";

type SpinnerTone = "accent" | "muted" | "foreground" | "accentForeground";

type SpinnerProps = {
  size?: "small" | "large";
  /** Spoken name for assistive tech. Default: Loading. */
  label?: string;
  tone?: SpinnerTone;
};

const TONE_TO_TOKEN: Record<SpinnerTone, ColorTokenName> = {
  accent: "accent",
  muted: "muted",
  foreground: "foreground",
  accentForeground: "accentForeground",
};

export const Spinner = ({ size = "small", label = "Loading", tone = "accent" }: SpinnerProps) => {
  const colorScheme = useColorScheme();
  const color = colorTokens[colorScheme][TONE_TO_TOKEN[tone]];

  return <ActivityIndicator accessibilityLabel={label} size={size} color={color} />;
};
