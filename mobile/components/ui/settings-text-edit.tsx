import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { cn } from "@/lib/cn";
import { colorTokens } from "@/theme/tokens";
import { ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";

type SettingsTextEditProps = Pick<
  TextInputProps,
  "value" | "onChangeText" | "onBlur" | "onSubmitEditing" | "editable" | "placeholder" | "accessibilityLabel" | "maxLength" | "autoCapitalize"
> & {
  /** Optional edge label above the ruled line. */
  label?: string;
  hint: string;
  /** Field validation or server error. */
  error?: string;
  saveLabel: string;
  onSave: () => void;
  isDirty: boolean;
  isSubmitting: boolean;
};

/**
 * Full-screen settings text editor: optional label, ruled field, hint, and a
 * pinned Save. Use for short text settings (name, note, and similar rows).
 */
export const SettingsTextEdit = ({
  label,
  value,
  hint,
  error,
  saveLabel,
  onSave,
  isDirty,
  isSubmitting,
  editable = true,
  ...input
}: SettingsTextEditProps) => (
  <View className="flex-1 bg-ground">
    <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-6" keyboardShouldPersistTaps="handled">
      <View className="gap-1.5">
        {label ? <EdgePrint>{label}</EdgePrint> : null}
        <View className={cn("border-b-2 pb-2 pt-2.5", value ? "border-text" : "border-outline-soft")}>
          <TextInput
            value={value}
            editable={editable && !isSubmitting}
            placeholderTextColor={colorTokens.outline}
            returnKeyType="done"
            keyboardAppearance="dark"
            selectionColor={colorTokens.pencil}
            cursorColor={colorTokens.pencil}
            className="p-0 font-display text-input-line text-text"
            // In points: h-6 renders at 21 (EV-165), short of the 18px line with its descenders.
            style={{ height: 24 }}
            {...input}
          />
        </View>
        <EdgePrint>{hint}</EdgePrint>
        {error ? (
          <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>

    <View className="px-5 pb-1 pt-3">
      <Button title={saveLabel} mark="✓" onPress={onSave} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
    </View>
  </View>
);
