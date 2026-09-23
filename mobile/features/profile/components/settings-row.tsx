import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
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
  const colors = colorTokens[useColorScheme()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 px-4 py-4 active:bg-border-muted"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-background">
        <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.muted} />
      </View>
      <View className="flex-1 gap-1">
        <ThemedText tone={destructive ? "danger" : "foreground"} className="text-base font-medium">
          {title}
        </ThemedText>
        {description ? (
          <ThemedText tone="muted" className="text-sm">
            {description}
          </ThemedText>
        ) : null}
      </View>
      {!disabled && onPress ? <Ionicons name="chevron-forward" size={20} color={colors.subtle} /> : null}
    </Pressable>
  );
};
