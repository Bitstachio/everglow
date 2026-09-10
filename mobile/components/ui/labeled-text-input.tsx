import { View, Text } from "react-native";
import AppTextInput from "./app-text-input";
import { ThemedText } from "./themed-text";

type LabeledTextInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  required?: boolean;
};

const LabeledTextInput = ({
  label,
  value,
  placeholder = "",
  onChangeText,
  required = false,
}: LabeledTextInputProps) => {
  return (
    <View className="space-y-2">
      <ThemedText className="font-semibold">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </ThemedText>
      <AppTextInput value={value} placeholder={placeholder} onChangeText={onChangeText} />
    </View>
  );
};

export default LabeledTextInput;
