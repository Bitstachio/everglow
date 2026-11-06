import { SettingsTextEdit } from "@/components/ui/settings-text-edit";
import { Controller, type Control } from "react-hook-form";
import type { EditEventTitleValues } from "../types";

type EditEventTitleFormProps = {
  control: Control<EditEventTitleValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  placeholder: string;
  accessibilityLabel: string;
  saveLabel: string;
};

/** Edit the roll's name from settings. */
export const EditEventTitleForm = ({
  control,
  isDirty,
  isSubmitting,
  error,
  onSubmit,
  placeholder,
  accessibilityLabel,
  saveLabel,
}: EditEventTitleFormProps) => (
  <Controller
    control={control}
    name="title"
    render={({ field, fieldState }) => (
      <SettingsTextEdit
        value={field.value}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        error={fieldState.error?.message ?? error}
        saveLabel={saveLabel}
        onSave={onSubmit}
        isDirty={isDirty}
        isSubmitting={isSubmitting}
        autoCapitalize="sentences"
        maxLength={100}
      />
    )}
  />
);
