import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

type EventActionCardProps = {
  title: string;
  description: string;
  onPress: () => void;
};

export const EventActionCard = ({ title, description, onPress }: EventActionCardProps) => {
  const colorScheme = useColorScheme();
  const icon = title === "Join Event" ? "qr-code-outline" : "add-circle-outline";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-1 gap-3 rounded-2xl border border-border bg-background p-4 active:opacity-80"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
        <Ionicons name={icon} size={IconSize.md} color={colorTokens[colorScheme].accent} />
      </View>

      <View className="gap-1">
        <ThemedText className="text-base font-semibold">{title}</ThemedText>
        <ThemedText className="text-sm" tone="muted">
          {description}
        </ThemedText>
      </View>
    </Pressable>
  );
};
