import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { H2 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from "react-native";

type EditProfileModalProps = {
  visible: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  control: Control<{ name: string; email: string }>;
  onSubmit: () => void;
  onCancel: () => void;
};

export const EditProfileModal = ({
  visible,
  isSubmitting,
  isDirty,
  control,
  onSubmit,
  onCancel,
}: EditProfileModalProps) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
    <KeyboardAvoidingView
      className="flex-1 justify-center bg-scrim p-4"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="grow justify-center" bounces={false}>
        <View className="gap-6 rounded-2xl bg-background p-6">
          <H2>Edit Profile</H2>
          <View className="gap-4">
            <FormField
              control={control}
              testID="profile-edit-name"
              name="name"
              label="Name"
              placeholder="Enter your name"
              editable={!isSubmitting}
              autoComplete="name"
            />
            <FormField
              control={control}
              testID="profile-edit-email"
              name="email"
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isSubmitting}
            />
            <ThemedText tone="muted" className="text-sm">
              This updates your profile email. Your sign-in email stays the same.
            </ThemedText>
          </View>
          <View className="gap-3">
            <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
            <Button
              testID="profile-edit-cancel"
              title="Cancel"
              onPress={onCancel}
              variant="outline"
              disabled={isSubmitting}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>
);
