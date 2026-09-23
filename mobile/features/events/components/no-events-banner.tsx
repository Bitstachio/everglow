import { AppIcon } from "@/components/ui/app-icon";
import { H3 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { Calendar } from "lucide-react-native";
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
  const { title, subtitle } = COPY[variant];

  return (
    <View className="items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-border">
        <AppIcon icon={Calendar} size="lg" className="text-muted" />
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
