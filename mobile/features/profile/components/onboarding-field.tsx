import { EdgePrint } from "@/components/ui/edge-print";
import { colorTokens } from "@/theme/tokens";
import { forwardRef, type ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

type OnboardingFieldProps = Omit<TextInputProps, "className"> & {
  /** Edge print above the field. */
  label: string;
  /** `name` is the large step 1 field; `handle` the username. */
  size: "name" | "handle";
  /** Printed before the value, dimmed: "@". */
  prefix?: string;
  /** Right of the value: Checking…, Available, Taken. */
  status?: ReactNode;
};

// The "@" prefix is plain text; the input uses a size with no line height and
// a fixed height, so it never re-measures when the placeholder gives way to text.
const PREFIX_CLASSES = { name: "text-title-event", handle: "text-title-slip" } as const;
const INPUT_CLASSES = { name: "h-12 text-input-name", handle: "h-9 text-input-handle" } as const;

/**
 * One big value on a ruled line, typed in Funnel Display with a pencil caret.
 * The rule and placeholder stay dim until something is typed.
 */
export const OnboardingField = forwardRef<TextInput, OnboardingFieldProps>(
  ({ label, size, prefix, status, value, ...props }, ref) => {
    const filled = Boolean(value);
    return (
      <View className="gap-2.5">
        <EdgePrint>{label}</EdgePrint>
        <View
          className={`flex-row items-center gap-2 border-b-2 pb-2 ${filled ? "border-text" : "border-outline-soft"}`}
        >
          {prefix ? <Text className={`font-display ${PREFIX_CLASSES[size]} text-outline`}>{prefix}</Text> : null}
          <TextInput
            ref={ref}
            value={value}
            placeholderTextColor={colorTokens.outline}
            keyboardAppearance="dark"
            selectionColor={colorTokens.pencil}
            cursorColor={colorTokens.pencil}
            className={`flex-1 p-0 font-display ${INPUT_CLASSES[size]} text-text`}
            {...props}
          />
          {status}
        </View>
      </View>
    );
  },
);
OnboardingField.displayName = "OnboardingField";
