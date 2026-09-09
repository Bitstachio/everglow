import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { Control } from "react-hook-form";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from "react-native";

type EditProfileModalProps = {
  visible: boolean;
  isDark: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  control: Control<{ name: string; email: string }>;
  onSubmit: () => void;
  onCancel: () => void;
};

export const EditProfileModal = ({
  visible,
  isDark,
  isSubmitting,
  isDirty,
  control,
  onSubmit,
  onCancel,
}: EditProfileModalProps) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
        <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>Edit Profile</Text>
        <FormField control={control} name="name" label="Name" placeholder="Enter your name" />
        <FormField
          control={control}
          name="email"
          label="Email"
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.modalActions}>
          <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
          <View style={styles.modalButtonSpacing} />
          <Button title="Cancel" onPress={onCancel} variant="outline" disabled={isSubmitting} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 12,
    padding: 24,
  },
  modalContentLight: {
    backgroundColor: "#FFFFFF",
  },
  modalContentDark: {
    backgroundColor: "#1F2937",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: "column",
    marginTop: 24,
  },
  modalButtonSpacing: {
    height: 12,
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
});
