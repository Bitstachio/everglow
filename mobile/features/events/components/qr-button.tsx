import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

type QRButtonProps = {
  onPress: () => void;
};

export const QRButton = ({ onPress }: QRButtonProps) => {
  const colorScheme = useColorScheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Scan QR Code"
      className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4 active:opacity-80"
    >
      <MaterialCommunityIcons name="camera" size={IconSize.md} color={colorTokens[colorScheme].foreground} />
      <View className="flex-1 gap-1">
        <ThemedText className="text-base font-semibold">Scan QR Code</ThemedText>
        <ThemedText className="text-sm" tone="muted">
          Opens your camera to scan an event invite
        </ThemedText>
      </View>
    </Pressable>
  );
};
