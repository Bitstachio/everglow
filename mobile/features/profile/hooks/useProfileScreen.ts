import { useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/auth-context";
import { deleteProfile, updateProfile } from "@/features/profile/api/profile.api";
import type { UpdateProfileData } from "@/features/profile/types";

type EditProfileForm = {
  name: string;
  email: string;
};

const emptyEditForm = (): EditProfileForm => ({
  name: "",
  email: "",
});

export const useProfileScreen = () => {
  const { user, logout, isLoading, updateUser } = useAuth();

  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<EditProfileForm>(emptyEditForm);

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

      const updatedUser = await updateProfile(data);
      updateUser(updatedUser);
      setShowEditModal(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update profile";
      Alert.alert("Error", message);
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
            await deleteProfile();
            await logout();
            Alert.alert("Success", "Account deleted successfully");
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete account";
            Alert.alert("Error", message);
          }
        },
      },
    ]);
  };

  const handleChangeName = (name: string) => {
    setEditForm((current) => ({ ...current, name }));
  };

  const handleChangeEmail = (email: string) => {
    setEditForm((current) => ({ ...current, email }));
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
  };

  return {
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
  };
};
