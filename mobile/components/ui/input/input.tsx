import { colorTokens } from "@/theme/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { useInput } from "./use-input";

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export const Input = ({ label, error, secureTextEntry, editable = true, className = "", ...props }: InputProps) => {
  const colorScheme = useColorScheme();
  const {
    showToggle,
    isDisabled,
    isSecure,
    toggleAccessibilityLabel,
    toggleIconName,
    onTogglePasswordVisibility,
  } = useInput({ secureTextEntry, editable });

  return (
    <View className="w-full gap-2">
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}

      <View className="gap-1">
        <View className="relative justify-center">
          <TextInput
            {...props}
            editable={editable}
            secureTextEntry={isSecure}
            placeholderTextColor={colorTokens[colorScheme].subtle}
            accessibilityState={{ disabled: isDisabled }}
            className={[
              "h-12 rounded-2xl border bg-background px-4 text-base text-foreground",
              error ? "border-danger" : "border-border",
              showToggle ? "pr-12" : "",
              isDisabled ? "opacity-50" : "",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          />

          {showToggle ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toggleAccessibilityLabel}
              onPress={onTogglePasswordVisibility}
              className="absolute right-3 h-9 w-9 items-center justify-center rounded-full active:bg-surface"
              hitSlop={8}
            >
              <Ionicons name={toggleIconName} size={20} color={colorTokens[colorScheme].muted} />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="text-xs text-danger">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
};
