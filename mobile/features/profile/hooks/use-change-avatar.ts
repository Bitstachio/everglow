import { useAuth } from "@/context/auth-context";
import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRemoveAvatarMutation, useSetAvatarMutation } from "../api/mutations";
import { prepareAvatarImage } from "../lib/avatar-image";

type PhotoSource = "camera" | "library";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
};

const PERMISSION_MESSAGES: Record<PhotoSource, string> = {
  camera: "Allow camera access in Settings to take a profile photo.",
  library: "Allow photo library access in Settings to choose a profile photo.",
};

const formatWait = (seconds: number) => (seconds < 60 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`);

const pickPhoto = async (source: PhotoSource): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Permission Required", PERMISSION_MESSAGES[source]);
    return null;
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled) return null;
  return result.assets[0] ?? null;
};

/**
 * Set, change or remove the profile photo from account settings. The photo is
 * cropped square and re-encoded as JPEG on device before upload, which also
 * converts HEIC from the camera roll.
 */
export const useChangeAvatar = () => {
  const { user } = useAuth();
  const setAvatarMutation = useSetAvatarMutation();
  const removeAvatarMutation = useRemoveAvatarMutation();
  const [isPreparing, setIsPreparing] = useState(false);
  const inFlight = useRef(false);
  // A 429 says how long to wait; asking again before then only extends the wait.
  const rateLimitedUntil = useRef(0);

  const hasAvatar = Boolean(user?.details?.avatarUrl);
  const isUpdatingAvatar = isPreparing || setAvatarMutation.isPending || removeAvatarMutation.isPending;

  const showRateLimited = () => {
    const seconds = Math.max(1, Math.ceil((rateLimitedUntil.current - Date.now()) / 1000));
    Alert.alert("Too many photo changes", `Please try again in ${formatWait(seconds)}.`);
  };

  const run = async (title: string, action: () => Promise<void>) => {
    if (inFlight.current) return;
    if (Date.now() < rateLimitedUntil.current) {
      showRateLimited();
      return;
    }
    inFlight.current = true;

    try {
      await action();
    } catch (error) {
      if (getErrorCode(error) === "RATE_LIMIT_EXCEEDED") {
        const seconds = (isApiError(error) && error.retryAfterSeconds) || 60;
        rateLimitedUntil.current = Date.now() + seconds * 1000;
        showRateLimited();
        return;
      }
      Alert.alert(title, getErrorMessage(error, "Please try again."));
    } finally {
      setIsPreparing(false);
      inFlight.current = false;
    }
  };

  const uploadFrom = (source: PhotoSource) =>
    run("Could not update photo", async () => {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setIsPreparing(true);
      const image = await prepareAvatarImage(asset);
      await setAvatarMutation.mutateAsync(image);
    });

  const removeAvatar = () =>
    run("Could not remove photo", async () => {
      await removeAvatarMutation.mutateAsync();
    });

  const handleChangeAvatar = () => {
    if (isUpdatingAvatar) return;
    Alert.alert("Profile Photo", undefined, [
      { text: "Take Photo", onPress: () => uploadFrom("camera") },
      { text: "Choose from Library", onPress: () => uploadFrom("library") },
      ...(hasAvatar ? [{ text: "Remove Photo", style: "destructive" as const, onPress: removeAvatar }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return {
    hasAvatar,
    isUpdatingAvatar,
    handleChangeAvatar,
  };
};
