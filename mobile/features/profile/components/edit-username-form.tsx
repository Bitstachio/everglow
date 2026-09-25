import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UsernameAvailabilityState } from "../lib/username";

type EditUsernameFormProps = {
  control: Control<{ username: string }>;
  isDirty: boolean;
  isSubmitting: boolean;
  availability: UsernameAvailabilityState;
  error?: string;
  onSubmit: () => void;
};

export const EditUsernameForm = ({
  control,
  isDirty,
  isSubmitting,
  availability,
  error,
  onSubmit,
}: EditUsernameFormProps) => {
  const insets = useSafeAreaInsets();
  const canSave = isDirty && availability.canSubmit && !isSubmitting;
  const availabilityTone =
    availability.status === "available" ? "muted" : availability.status === "checking" ? "muted" : "danger";

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <FormField
            control={control}
            name="username"
            label="Username"
            accessibilityLabel="Username"
            placeholder="Enter your username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={!isSubmitting}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
          <ThemedText tone="muted" className="text-sm">
            Use lowercase letters, numbers, periods, or underscores.
          </ThemedText>
          {availability.message && availability.status !== "idle" ? (
            <ThemedText
              accessibilityLiveRegion="polite"
              tone={availabilityTone}
              className="text-sm"
              accessibilityRole={
                availability.status === "unavailable" || availability.status === "paused" ? "alert" : undefined
              }
            >
              {availability.message}
            </ThemedText>
          ) : null}
          {error ? (
            <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
              {error}
            </ThemedText>
          ) : null}
        </View>
      </ScrollView>

      <View className="px-4 pt-3" style={{ paddingBottom: 16 + insets.bottom }}>
        <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={!canSave} />
      </View>
    </View>
  );
};
