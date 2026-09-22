import { ThemedText } from "@/components/ui/themed-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

type QRButtonProps = {
  onPress: () => void;
};

export const QRButton = ({ onPress }: QRButtonProps) => {
  return (
    <Pressable
      className={`
        flex-row items-center gap-3 p-4 rounded-2xl
        border border-border bg-surface
        active:opacity-85
      `}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Scan QR Code"
    >
      <View className="text-foreground">
        <MaterialCommunityIcons name="camera" size={22} color="currentColor" />
      </View>
      <View className="flex-1 gap-1">
        <ThemedText className="font-semibold">Scan QR Code</ThemedText>
        <ThemedText tone="muted">Opens your camera to scan an event invite</ThemedText>
      </View>
    </Pressable>
  );
};
