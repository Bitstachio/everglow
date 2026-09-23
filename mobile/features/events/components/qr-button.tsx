import { AppIcon } from "@/components/ui/app-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { Camera } from "lucide-react-native";
import { Pressable, View } from "react-native";

type QRButtonProps = {
  onPress: () => void;
};

export const QRButton = ({ onPress }: QRButtonProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Scan QR Code"
    className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4 active:opacity-80"
  >
    <AppIcon icon={Camera} size="md" className="text-foreground" />
    <View className="flex-1 gap-1">
      <ThemedText className="text-base font-semibold">Scan QR Code</ThemedText>
      <ThemedText className="text-sm" tone="muted">
        Opens your camera to scan an event invite
      </ThemedText>
    </View>
  </Pressable>
);
