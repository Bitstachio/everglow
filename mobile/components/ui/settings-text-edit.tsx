import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { cn } from "@/lib/cn";
import { colorTokens } from "@/theme/tokens";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, TextInput, View, type TextInputProps } from "react-native";

type SettingsTextEditProps = Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "onBlur"
  | "onSubmitEditing"
  | "editable"
  | "placeholder"
  | "accessibilityLabel"
  | "maxLength"
  | "autoCapitalize"
> & {
  /** Optional edge label above the ruled line. */
  label?: string;
  /** A line under the field, only when it says something the field doesn’t. */
  hint?: string;
  /** Field validation or server error. */
  error?: string;
  saveLabel: string;
  onSave: () => void;
  isDirty: boolean;
  isSubmitting: boolean;
};

/**
 * Full-screen settings text editor: optional label, ruled field, optional hint and a
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
  maxLength,
  ...input
}: SettingsTextEditProps) => {
  const { t } = useTranslation("common");
  const length = value?.length ?? 0;
  const atLimit = maxLength != null && length >= maxLength;

  return (
    <View className="flex-1 bg-ground">
      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1.5">
          {label ? <EdgePrint>{label}</EdgePrint> : null}
          <View className={cn("border-b-2 pb-2 pt-2.5", value ? "border-text" : "border-outline-soft")}>
            <TextInput
              value={value}
              editable={editable && !isSubmitting}
              maxLength={maxLength}
              // The screen is only this field, so the keyboard comes up with it.
              autoFocus
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
          {maxLength != null ? (
            <EdgePrint
              className="self-end"
              tone={atLimit ? "pencil" : "edge"}
              accessibilityLabel={t("a11y.characterCount", { count: length, max: maxLength })}
            >
              {`${length} / ${maxLength}`}
            </EdgePrint>
          ) : null}
        </View>

        {hint ? <Text className="mt-5 font-sans text-body text-text-2">{hint}</Text> : null}
        {error ? (
          <Text accessibilityRole="alert" className="mt-1.5 font-sans text-body text-pencil">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-1 pt-3">
        <Button
          title={saveLabel}
          mark="✓"
          onPress={onSave}
          isLoading={isSubmitting}
          disabled={isSubmitting || !isDirty}
        />
      </View>
    </View>
  );
};
