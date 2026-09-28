import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { ScrollView, View } from "react-native";
import type { EditEventTitleValues } from "../types";

type EditEventTitleFormProps = {
  control: Control<EditEventTitleValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
};

export const EditEventTitleForm = ({ control, isDirty, isSubmitting, error, onSubmit }: EditEventTitleFormProps) => (
  <View className="flex-1 bg-background">
    <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" keyboardShouldPersistTaps="handled">
      <View className="gap-2">
        <FormField
          control={control}
          name="title"
          label="Event Title"
          accessibilityLabel="Event Title"
          placeholder="Enter event title"
          editable={!isSubmitting}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <ThemedText tone="muted" className="text-sm">
          This is the name people see when browsing or joining your event.
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
