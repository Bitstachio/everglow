import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { userService, UpdateProfileData } from "@/lib/user";

export default function ProfileScreen() {
  const { user, logout, isLoading, updateUser } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user?.details?.name || "",
    email: user?.details?.email || "",
  });

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: logout,
      },
    ]);
  };

  const handleEditProfile = () => {
    setEditForm({
      name: user?.details?.name || "",
      email: user?.details?.email || "",
    });
    setShowEditModal(true);
  };

  const handleUpdateProfile = async () => {
    try {
      setIsSubmitting(true);
      const data: UpdateProfileData = {};

      if (editForm.name !== user?.details?.name) data.name = editForm.name;
      if (editForm.email !== user?.details?.email) data.email = editForm.email;

      if (Object.keys(data).length === 0) {
        setShowEditModal(false);
        return;
      }

      const updatedUser = await userService.updateProfile(data);
      updateUser(updatedUser);
      setShowEditModal(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert("Delete Account", "Are you sure you want to delete your account? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await userService.deleteProfile();
            await logout();
            Alert.alert("Success", "Account deleted successfully");
          } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to delete account");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.details?.name?.charAt(0).toUpperCase() || "U"}</Text>
          </View>
          <Text style={[styles.name, isDark ? styles.textDark : styles.textLight]}>
            {user?.details?.name || "User"}
          </Text>
          <Text style={[styles.email, isDark ? styles.emailDark : styles.emailLight]}>
            {user?.details?.email || "user@example.com"}
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Account Settings</Text>
          <TouchableOpacity
            style={[styles.menuItem, isDark ? styles.menuItemDark : styles.menuItemLight]}
            onPress={handleEditProfile}
          >
            <Text style={[styles.menuItemText, isDark ? styles.textDark : styles.textLight]}>Edit Profile</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actions}>
          <Button title="Logout" onPress={handleLogout} isLoading={isLoading} variant="outline" />
          <TouchableOpacity
            style={[styles.deleteButton, isDark ? styles.menuItemDark : styles.menuItemLight]}
            onPress={handleDeleteAccount}
          >
            <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={showEditModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
            <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>Edit Profile</Text>
            <Input
              label="Name"
              placeholder="Enter your name"
              value={editForm.name}
              onChangeText={(text) => setEditForm({ ...editForm, name: text })}
            />
            <Input
              label="Email"
              placeholder="Enter your email"
              value={editForm.email}
              onChangeText={(text) => setEditForm({ ...editForm, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Button title="Save" onPress={handleUpdateProfile} isLoading={isSubmitting} disabled={isSubmitting} />
              <View style={styles.modalButtonSpacing} />
              <Button
                title="Cancel"
                onPress={() => setShowEditModal(false)}
                variant="outline"
                disabled={isSubmitting}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: "#F9FAFB",
  },
  containerDark: {
    backgroundColor: "#111827",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: "center",
    paddingVertical: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
  },
  emailLight: {
    color: "#6B7280",
  },
  emailDark: {
    color: "#9CA3AF",
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
  section: {
    marginTop: 32,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  menuItemLight: {
    backgroundColor: "#FFFFFF",
  },
  menuItemDark: {
    backgroundColor: "#1F2937",
  },
  menuItemDanger: {
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  menuItemTextDanger: {
    color: "#DC2626",
  },
  menuItemIcon: {
    fontSize: 24,
    color: "#9CA3AF",
  },
  actions: {
    marginTop: "auto",
    paddingBottom: 24,
  },
  deleteButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#DC2626",
  },
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
});
