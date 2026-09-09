import { Input } from "@/components/ui/input";
import { Controller, type Control, type FieldPathByValue, type FieldValues } from "react-hook-form";
import type { TextInputProps } from "react-native";

type FormFieldProps<TFieldValues extends FieldValues> = Omit<TextInputProps, "value" | "onChangeText" | "onBlur"> & {
  control: Control<TFieldValues>;
  // Restricted to string-valued paths so `field.value` needs no cast.
  name: FieldPathByValue<TFieldValues, string>;
  label?: string;
};

export const FormField = <TFieldValues extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: FormFieldProps<TFieldValues>) => (
  <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => (
      <Input
        {...inputProps}
        label={label}
        value={field.value}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        error={fieldState.error?.message}
      />
    )}
  />
);
