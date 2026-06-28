import { KeyboardAvoidingView, Modal, Platform, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EditProfileModalProps = {
  visible: boolean;
  name: string;
  email: string;
  isSubmitting: boolean;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export const EditProfileModal = ({
  visible,
  name,
  email,
  isSubmitting,
  onChangeName,
  onChangeEmail,
  onSubmit,
  onClose,
}: EditProfileModalProps) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView
      className="flex-1 items-center justify-center bg-black/50 p-6"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="w-full max-w-[480px] rounded-xl bg-ui-background p-6 dark:bg-dark-surface">
        <Text className="mb-6 text-2xl font-bold text-text-main dark:text-dark-text">Edit Profile</Text>
        <Input label="Name" placeholder="Enter your name" value={name} onChangeText={onChangeName} />
        <Input
          label="Email"
          placeholder="Enter your email"
          value={email}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View className="mt-6">
          <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting} />
          <View className="h-3" />
          <Button title="Cancel" onPress={onClose} variant="outline" disabled={isSubmitting} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);
