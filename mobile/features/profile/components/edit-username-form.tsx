import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type EditUsernameFormProps = {
  control: Control<{ username: string }>;
  isDirty: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export const EditUsernameForm = ({ control, isDirty, isSubmitting, onSubmit }: EditUsernameFormProps) => {
  const insets = useSafeAreaInsets();

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
            You can change your username up to 5 times within 30 minutes. Use lowercase letters, numbers, periods, or
            underscores.
          </ThemedText>
        </View>
      </ScrollView>

      <View className="px-4 pt-3" style={{ paddingBottom: 16 + insets.bottom }}>
        <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
      </View>
    </View>
  );
};
