import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/ui/button";
import { EditProfileModal } from "../components/EditProfileModal";
import { useProfileScreen } from "../hooks/useProfileScreen";
import { useColorScheme } from "@/hooks/use-color-scheme";

const ProfileScreen = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const {
    user,
    isLoading,
    showEditModal,
    isSubmitting,
    editForm,
    handleLogout,
    handleEditProfile,
    handleUpdateProfile,
    handleDeleteAccount,
    handleChangeName,
    handleChangeEmail,
    handleCancelEdit,
  } = useProfileScreen();

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
      <EditProfileModal
        visible={showEditModal}
        isDark={isDark}
        isSubmitting={isSubmitting}
        editForm={editForm}
        onChangeName={handleChangeName}
        onChangeEmail={handleChangeEmail}
        onSave={handleUpdateProfile}
        onCancel={handleCancelEdit}
      />
    </ScrollView>
  );
};

export default ProfileScreen;

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
});
