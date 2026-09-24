import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input/input";
import { ThemedText } from "@/components/ui/themed-text";
import { Modal, Pressable, View } from "react-native";

type ForgotPasswordModalProps = {
  visible: boolean;
  email: string;
  error?: string | null;
  isSubmitting: boolean;
  onChangeEmail: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export const ForgotPasswordModal = ({
  visible,
  email,
  error,
  isSubmitting,
  onChangeEmail,
  onSubmit,
  onCancel,
}: ForgotPasswordModalProps) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 items-center justify-center bg-scrim px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss forgot password"
        className="absolute inset-0"
        disabled={isSubmitting}
        onPress={onCancel}
      />
      <View
        accessibilityViewIsModal
        className="w-full max-w-md gap-4 rounded-2xl border border-border bg-surface p-6"
      >
        <View className="gap-1">
          <ThemedText className="text-lg font-semibold">Reset password</ThemedText>
          <ThemedText tone="muted" className="text-sm">
            Enter the email for your Everglow account. We will send a reset link from Auth0.
          </ThemedText>
        </View>
        <Input
          label="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={email}
          onChangeText={onChangeEmail}
          editable={!isSubmitting}
          error={error ?? undefined}
          accessibilityLabel="Email"
        />
        <View className="gap-3">
          <Button title="Send reset link" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting} />
          <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={isSubmitting} />
        </View>
      </View>
    </View>
  </Modal>
);
