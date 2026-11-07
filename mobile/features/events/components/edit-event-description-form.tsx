import { SettingsTextEdit } from "@/components/ui/settings-text-edit";
import { Controller, type Control } from "react-hook-form";
import type { EditEventDescriptionValues } from "../types";

type EditEventDescriptionFormProps = {
  control: Control<EditEventDescriptionValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  label: string;
  placeholder: string;
  accessibilityLabel: string;
  hint: string;
  saveLabel: string;
};

/** Edit the optional note for guests from settings. */
export const EditEventDescriptionForm = ({
  control,
  isDirty,
  isSubmitting,
  error,
  onSubmit,
  label,
  placeholder,
  accessibilityLabel,
  hint,
  saveLabel,
}: EditEventDescriptionFormProps) => (
  <Controller
    control={control}
    name="description"
    render={({ field, fieldState }) => (
      <SettingsTextEdit
        label={label}
        value={field.value}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        hint={hint}
        error={fieldState.error?.message ?? error}
        saveLabel={saveLabel}
        onSave={onSubmit}
        isDirty={isDirty}
        isSubmitting={isSubmitting}
        maxLength={255}
      />
    )}
  />
);
