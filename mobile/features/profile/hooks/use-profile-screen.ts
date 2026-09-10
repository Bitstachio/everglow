import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { Alert } from "react-native";
import { useDeleteProfileMutation } from "../api/mutations";
import { useEditProfileForm } from "./use-edit-profile-form";

export const useProfileScreen = () => {
  const { user, logout, isLoading } = useAuth();
  const deleteProfileMutation = useDeleteProfileMutation();
  const [showEditModal, setShowEditModal] = useState(false);

  const { form, onSubmit } = useEditProfileForm({
    user,
    onSuccess: () => {
      setShowEditModal(false);
      Alert.alert("Success", "Profile updated successfully");
    },
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
    form.reset({
      name: user?.details?.name ?? "",
      email: user?.details?.email ?? "",
    });
    setShowEditModal(true);
  };

  const handleDeleteAccount = () => {
    Alert.alert("Delete Account", "Are you sure you want to delete your account? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteProfileMutation.mutate(undefined, {
            onSuccess: async () => {
              await logout();
              Alert.alert("Success", "Account deleted successfully");
            },
            onError: (error) => {
              Alert.alert("Error", getErrorMessage(error, "Failed to delete account"));
            },
          });
        },
      },
    ]);
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
  };

  return {
    user,
    isLoading,
    showEditModal,
    form,
    onSubmit,
    handleLogout,
    handleEditProfile,
    handleDeleteAccount,
    handleCancelEdit,
  };
};
