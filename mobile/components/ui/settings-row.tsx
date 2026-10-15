import { ThemedText } from "@/components/ui/themed-text";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";

type SettingsRowProps = {
  title: string;
  description?: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export const SettingsRow = ({
  title,
  description,
  icon,
  onPress,
  disabled = false,
  destructive = false,
}: SettingsRowProps) => {
  const colors = colorTokens;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-line px-4 py-4 active:bg-sheet"
    >
      <View className="h-6 w-6 items-center justify-center">
        <Ionicons name={icon} size={20} color={destructive ? colors.text : colors.edge} />
      </View>
      <View className="flex-1 gap-1">
        <ThemedText className="font-mono-semibold text-text-button uppercase">{title}</ThemedText>
        {description ? (
          <ThemedText tone="muted" className="text-body">
            {description}
          </ThemedText>
        ) : null}
      </View>
      {!disabled && onPress ? <Ionicons name="chevron-forward" size={18} color={colors.edge} /> : null}
    </Pressable>
  );
};
