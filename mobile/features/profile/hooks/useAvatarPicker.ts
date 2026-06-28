import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useUploadAvatarMutation } from "../api/useUploadAvatarMutation";
import { useDeleteAvatarMutation } from "../api/useDeleteAvatarMutation";
import { ProfileApiError } from "../api/profileApi";

export const useAvatarPicker = (hasAvatar: boolean) => {
  const uploadAvatarMutation = useUploadAvatarMutation();
  const deleteAvatarMutation = useDeleteAvatarMutation();

  const pickAndUploadAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please grant photo library access to change your avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    const fileName = asset.fileName ?? `avatar-${Date.now()}.jpg`;
    const mimeType = asset.mimeType ?? "image/jpeg";

    try {
      await uploadAvatarMutation.mutateAsync({
        uri: asset.uri,
        fileName,
        mimeType,
      });
      Alert.alert("Success", "Avatar updated successfully");
    } catch (error) {
      const message = error instanceof ProfileApiError ? error.message : "Failed to upload avatar";
      Alert.alert("Error", message);
    }
  }, [uploadAvatarMutation]);

  const removeAvatar = useCallback(async () => {
    try {
      await deleteAvatarMutation.mutateAsync();
      Alert.alert("Success", "Avatar removed successfully");
    } catch (error) {
      const message = error instanceof ProfileApiError ? error.message : "Failed to remove avatar";
      Alert.alert("Error", message);
    }
  }, [deleteAvatarMutation]);

  const showAvatarActions = useCallback(() => {
    const options = hasAvatar
      ? [
          { text: "Change Photo", onPress: () => void pickAndUploadAvatar() },
          { text: "Remove Photo", style: "destructive" as const, onPress: () => void removeAvatar() },
          { text: "Cancel", style: "cancel" as const },
        ]
      : [
          { text: "Choose Photo", onPress: () => void pickAndUploadAvatar() },
          { text: "Cancel", style: "cancel" as const },
        ];

    Alert.alert("Profile Photo", undefined, options);
  }, [hasAvatar, pickAndUploadAvatar, removeAvatar]);

  return {
    showAvatarActions,
    isAvatarLoading: uploadAvatarMutation.isPending || deleteAvatarMutation.isPending,
  };
};
