import { ActivityIndicator, Pressable, Text } from "react-native";

type AppButtonProps = {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  bgClasses?: string;
  textClasses?: string;
  spinnerColor?: string;
};

const AppButton = ({
  text,
  onPress,
  disabled = false,
  loading = false,
  bgClasses = "",
  textClasses = "",
  spinnerColor = "white",
}: AppButtonProps) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    className={`
        w-full rounded-2xl py-3 px-4 items-center justify-center active:opacity-80
        ${bgClasses} ${disabled ? "opacity-50" : ""}
      `}
  >
    {loading ? <ActivityIndicator color={spinnerColor} /> : <Text className={textClasses}>{text}</Text>}
  </Pressable>
);

export default AppButton;
