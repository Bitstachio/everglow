import { AppIcon } from "@/components/ui/app-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { CirclePlus } from "lucide-react-native";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";

type EventActionCardProps = {
  title: string;
  description: string;
  onPress: () => void;
  icon?: ComponentProps<typeof AppIcon>["icon"];
};

export const EventActionCard = ({ title, description, onPress, icon = CirclePlus }: EventActionCardProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    onPress={onPress}
    className="flex-1 gap-3 rounded-2xl border border-border bg-background p-4 active:opacity-80"
  >
    <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
      <AppIcon icon={icon} size="md" className="text-accent" />
    </View>

    <View className="gap-1">
      <ThemedText className="text-base font-semibold">{title}</ThemedText>
      <ThemedText className="text-sm" tone="muted">
        {description}
      </ThemedText>
    </View>
  </Pressable>
);
