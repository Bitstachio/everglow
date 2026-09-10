import { ThemedText } from "@/components/ui/themed-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

type QRButtonProps = {
  onPress: () => void;
};

const QRButton = ({ onPress }: QRButtonProps) => {
  return (
    <Pressable
      className={`
        flex-row items-center gap-3 p-4 rounded-xl
        border border-ui-border dark:border-dark-border
        bg-ui-surfaceHover dark:bg-dark-surfaceHover
        active:opacity-85
      `}
      onPress={onPress}
    >
      <View className="text-text-main dark:text-dark-text">
        <MaterialCommunityIcons name="camera" size={22} color="currentColor" />
      </View>
      <View className="flex-1 gap-1">
        <ThemedText className="font-semibold">Scan QR Code</ThemedText>
        <ThemedText textColor="muted">Opens your camera to scan an event invite</ThemedText>
      </View>
    </Pressable>
  );
};

export default QRButton;
