import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useDeleteProfileMutation } from "../api/mutations";
import type { DeleteAccountPhotoPolicy } from "../types";
import { useEditProfileForm } from "./use-edit-profile-form";

const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const useProfileScreen = () => {
  const { user, logout, isLoading } = useAuth();
  const deleting = useRef(false);
  const deleteProfileMutation = useDeleteProfileMutation();
  const [showEditModal, setShowEditModal] = useState(false);
  const params = useLocalSearchParams<{ username?: string | string[] }>();

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

  const confirmDeleteAccount = (photos: DeleteAccountPhotoPolicy) => {
    Alert.alert(
      "Permanently delete account?",
      `${photos === "KEEP" ? "Your photos will remain in shared events without your name." : "Your uploaded photos will be removed from all events."} Events where you are the only member will be deleted. Other events will be handed over to remaining members. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            if (deleting.current) return;
            deleting.current = true;
            try {
              await deleteProfileMutation.mutateAsync(photos);
              await logout();
            } catch (error) {
              Alert.alert("Could not delete account", getErrorMessage(error, "Please try again."));
            } finally {
              deleting.current = false;
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    if (deleting.current) return;
    Alert.alert(
      "What happens to your photos?",
      "Choose what to do with your uploads in shared events when you delete your account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Keep shared photos", onPress: () => confirmDeleteAccount("KEEP") },
        { text: "Delete my photos", style: "destructive", onPress: () => confirmDeleteAccount("DELETE") },
      ],
    );
  };

  const handleCancelEdit = () => {
    if (!form.formState.isSubmitting) setShowEditModal(false);
  };

  const username = firstParam(params.username) ?? user?.details?.email.split("@")[0] ?? "Not set";

  return {
    user,
    username,
    handleOpenUsername: () => router.push({ pathname: "/edit-username", params: { username } }),
    handleOpenDisplayName: () => router.push("/edit-display-name"),
    handleOpenUsage: () => router.push("/usage"),
    isDeleting: deleteProfileMutation.isPending,
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
