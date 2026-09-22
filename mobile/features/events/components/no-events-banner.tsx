import { H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

type NoEventsBannerVariant = "empty" | "no-matches";

type NoEventsBannerProps = {
  variant?: NoEventsBannerVariant;
};

const COPY: Record<NoEventsBannerVariant, { title: string; subtitle: string }> = {
  empty: {
    title: "No events yet",
    subtitle: "Events you create or join will appear here",
  },
  "no-matches": {
    title: "No matching events",
    subtitle: "Try adjusting your filters",
  },
};

export const NoEventsBanner = ({ variant = "empty" }: NoEventsBannerProps) => {
  const colorScheme = useColorScheme();
  const { title, subtitle } = COPY[variant];

  return (
    <View className="items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-border">
        <Ionicons name="calendar-outline" size={IconSize.lg} color={colorTokens[colorScheme].muted} />
      </View>
      <View className="items-center gap-2">
        <H3>{title}</H3>
        <ThemedText className="text-center text-sm" tone="muted">
          {subtitle}
        </ThemedText>
      </View>
    </View>
  );
};
