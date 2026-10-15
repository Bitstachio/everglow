import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { EdgePrint } from "../edge-print";
import { IconButton } from "../icon-button";
import { useInput } from "./use-input";

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export const Input = ({ label, error, secureTextEntry, editable = true, className = "", ...props }: InputProps) => {
  const { showToggle, isDisabled, isSecure, toggleAccessibilityLabel, toggleIconName, onTogglePasswordVisibility } =
    useInput({ secureTextEntry, editable });

  return (
    <View className="w-full gap-2">
      {label ? <EdgePrint>{label}</EdgePrint> : null}

      <View className="gap-1">
        <View className="relative justify-center">
          <TextInput
            {...props}
            editable={editable}
            secureTextEntry={isSecure}
            placeholderTextColor={colorTokens.subtle}
            accessibilityState={{ disabled: isDisabled }}
            className={[
              "h-12 border-b-2 bg-transparent font-sans text-name text-text",
              error ? "border-pencil" : "border-text",
              showToggle ? "pr-12" : "",
              isDisabled ? "opacity-50" : "",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
          />

          {showToggle ? (
            <View className="absolute right-3">
              <IconButton accessibilityLabel={toggleAccessibilityLabel} onPress={onTogglePasswordVisibility}>
                <Ionicons name={toggleIconName} size={20} color={colorTokens.muted} />
              </IconButton>
            </View>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
};
