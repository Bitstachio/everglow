import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { ScrollView, View } from "react-native";
import type { EditEventDescriptionValues } from "../types";

type EditEventDescriptionFormProps = {
  control: Control<EditEventDescriptionValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
};

export const EditEventDescriptionForm = ({
  control,
  isDirty,
  isSubmitting,
  error,
  onSubmit,
}: EditEventDescriptionFormProps) => (
  <View className="flex-1 bg-background">
    <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" keyboardShouldPersistTaps="handled">
      <View className="gap-2">
        <FormField
          control={control}
          name="description"
          label="Description"
          accessibilityLabel="Description"
          placeholder="Enter event description"
          editable={!isSubmitting}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <ThemedText tone="muted" className="text-sm">
          Optional details about the plan, location, or what guests should bring.
        </ThemedText>
        {error ? (
          <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
            {error}
          </ThemedText>
        ) : null}
      </View>
    </ScrollView>

    <View className="px-4 pt-3 pb-4">
      <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
    </View>
  </View>
);
