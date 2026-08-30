import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

type EditProfileForm = {
  name: string;
  email: string;
};

type EditProfileModalProps = {
  visible: boolean;
  isDark: boolean;
  isSubmitting: boolean;
  editForm: EditProfileForm;
  onChangeName: (name: string) => void;
  onChangeEmail: (email: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export const EditProfileModal = ({
  visible,
  isDark,
  isSubmitting,
  editForm,
  onChangeName,
  onChangeEmail,
  onSave,
  onCancel,
}: EditProfileModalProps) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
        <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>Edit Profile</Text>
        <Input
          label="Name"
          placeholder="Enter your name"
          value={editForm.name}
          onChangeText={onChangeName}
        />
        <Input
          label="Email"
          placeholder="Enter your email"
          value={editForm.email}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.modalActions}>
          <Button title="Save" onPress={onSave} isLoading={isSubmitting} disabled={isSubmitting} />
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
