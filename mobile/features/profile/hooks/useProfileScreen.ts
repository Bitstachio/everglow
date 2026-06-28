import { useCallback } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useProfileQuery } from "../api/useProfileQuery";
import { useDeleteAccountMutation } from "../api/useDeleteAccountMutation";
import { profileKeys } from "../api/keys";
import { ProfileApiError } from "../api/profileApi";
import { useEditProfileModal } from "./useEditProfileModal";
import { useAvatarPicker } from "./useAvatarPicker";

export const useProfileScreen = () => {
  const queryClient = useQueryClient();
  const { logout, isLoading: isAuthLoading } = useAuth();
  const { data: profile, isFetching, refetch } = useProfileQuery();
  const deleteAccountMutation = useDeleteAccountMutation();
  const editProfileModal = useEditProfileModal(profile);
  const hasAvatar = !!profile?.details?.avatarUrl;
  const avatarPicker = useAvatarPicker(hasAvatar);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.me() });
    }, [queryClient]),
  );

  const handleLogout = useCallback(() => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => void logout(),
      },
    ]);
  }, [logout]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert("Delete Account", "Are you sure you want to delete your account? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteAccountMutation.mutateAsync();
              Alert.alert("Success", "Account deleted successfully");
            } catch (error) {
              const message = error instanceof ProfileApiError ? error.message : "Failed to delete account";
              Alert.alert("Error", message);
            }
          })();
        },
      },
    ]);
  }, [deleteAccountMutation]);

  return {
    profile,
    isRefreshing: isFetching,
    isAuthLoading,
    isDeletingAccount: deleteAccountMutation.isPending,
    editProfileModal,
    avatarPicker,
    handleLogout,
    handleDeleteAccount,
    refresh: refetch,
  };
};
