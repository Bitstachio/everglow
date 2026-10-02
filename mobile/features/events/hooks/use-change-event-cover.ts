import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRemoveEventCoverMutation, useSetEventCoverMutation } from "../api/mutations";
import { COVER_ASPECT, prepareCoverImage } from "../lib/cover-image";

type PhotoSource = "camera" | "library";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: COVER_ASPECT,
  quality: 1,
};

const PERMISSION_MESSAGES: Record<PhotoSource, string> = {
  camera: "Allow camera access in Settings to take a cover photo.",
  library: "Allow photo library access in Settings to choose a cover photo.",
};

const formatWait = (seconds: number) => (seconds < 60 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`);

const coverErrorMessage = (error: unknown): string => {
  switch (getErrorCode(error)) {
    case "IMAGE_UNSUPPORTED_CONTENT_TYPE":
    case "IMAGE_INVALID_SIZE":
      return "This photo can't be used. Try a different one.";
    case "IMAGE_UPLOAD_EXPIRED":
    case "IMAGE_UPLOAD_REJECTED":
      return "The upload didn't go through. Please try again.";
  }
  if (isApiError(error) && error.status === 403) {
    return "Only organizers can change the cover, and you're no longer one for this event.";
  }
  if (isApiError(error) && error.status === 409) {
    return "Another organizer changed the cover at the same time. Please try again.";
  }
  return getErrorMessage(error, "Please try again.");
};

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
 * Set, change or remove an event's cover from event settings. The photo is
 * cropped to 16:9 and re-encoded as JPEG on device before upload, which also
 * converts HEIC from the camera roll.
 */
export const useChangeEventCover = (eventId: string, hasCover: boolean) => {
  const setCoverMutation = useSetEventCoverMutation(eventId);
  const removeCoverMutation = useRemoveEventCoverMutation(eventId);
  const [isPreparing, setIsPreparing] = useState(false);
  const inFlight = useRef(false);
  // A 429 says how long to wait; asking again before then only extends the wait.
  const rateLimitedUntil = useRef(0);

  const isUpdatingCover = isPreparing || setCoverMutation.isPending || removeCoverMutation.isPending;

  const showRateLimited = () => {
    const seconds = Math.max(1, Math.ceil((rateLimitedUntil.current - Date.now()) / 1000));
    Alert.alert("Too many cover changes", `Please try again in ${formatWait(seconds)}.`);
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
      Alert.alert(title, coverErrorMessage(error));
    } finally {
      setIsPreparing(false);
      inFlight.current = false;
    }
  };

  const uploadFrom = (source: PhotoSource) =>
    run("Could not update cover", async () => {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setIsPreparing(true);
      const image = await prepareCoverImage(asset);
      await setCoverMutation.mutateAsync(image);
    });

  const removeCover = () =>
    run("Could not remove cover", async () => {
      await removeCoverMutation.mutateAsync();
    });

  const handleChangeCover = () => {
    if (isUpdatingCover) return;
    Alert.alert("Cover Photo", undefined, [
      { text: "Take Photo", onPress: () => uploadFrom("camera") },
      { text: "Choose from Library", onPress: () => uploadFrom("library") },
      ...(hasCover ? [{ text: "Remove Cover", style: "destructive" as const, onPress: removeCover }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return {
    isUpdatingCover,
    handleChangeCover,
  };
};
