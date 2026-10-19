import { EdgePrint } from "@/components/ui/edge-print";
import { colorTokens } from "@/theme/tokens";
import { forwardRef } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

type GuestLineProps = Pick<
  TextInputProps,
  "value" | "onChangeText" | "onBlur" | "onSubmitEditing" | "editable" | "placeholder" | "accessibilityLabel"
> & {
  label: string;
};

/** 04.2 An optional line for guests, on a ruled line that stays dim until something is written. */
export const GuestLine = forwardRef<TextInput, GuestLineProps>(({ label, value, ...props }, ref) => (
  <View className="gap-1.5">
    <EdgePrint>{label}</EdgePrint>
    <View className={`border-b-2 pb-2 pt-2.5 ${value ? "border-text" : "border-outline-soft"}`}>
      <TextInput
        ref={ref}
        value={value}
        placeholderTextColor={colorTokens.outline}
        returnKeyType="done"
        maxLength={255}
        keyboardAppearance="dark"
        selectionColor={colorTokens.pencil}
        cursorColor={colorTokens.pencil}
        className="h-6 p-0 font-display text-input-line text-text"
        {...props}
      />
    </View>
  </View>
));
GuestLine.displayName = "GuestLine";
