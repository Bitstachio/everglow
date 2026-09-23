import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { ScrollView, View } from "react-native";

type EditDisplayNameFormProps = {
  control: Control<{ name: string }>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
};

export const EditDisplayNameForm = ({ control, isDirty, isSubmitting, error, onSubmit }: EditDisplayNameFormProps) => (
  <View className="flex-1 bg-background">
    <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6" keyboardShouldPersistTaps="handled">
      <FormField
        control={control}
        name="name"
        label="Display Name"
        accessibilityLabel="Display Name"
        placeholder="Enter your display name"
        autoCapitalize="words"
        autoComplete="name"
        editable={!isSubmitting}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      <ThemedText tone="muted" className="text-sm">
        Help people recognize you by using the name you’re known by: your full name, nickname, or business name.
      </ThemedText>
      {error ? (
        <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
          {error}
        </ThemedText>
      ) : null}
    </ScrollView>
    <View className="px-4 pt-3 pb-4">
      <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
    </View>
  </View>
);
