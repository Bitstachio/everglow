import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import type { CropRect, PickedImage } from "@/lib/prepare-image";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRemoveEventCoverMutation, useSetEventCoverMutation } from "../api/mutations";
import { prepareCoverImage } from "../lib/cover-image";

type PhotoSource = "camera" | "library";

// Not cropped here: iOS's editor only crops square, so the cover crop frames it at 16:9.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };

const PERMISSION_MESSAGES: Record<PhotoSource, string> = {
  camera: "Allow camera access in Settings to take a cover photo.",
  library: "Allow photo library access in Settings to choose a cover photo.",
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
 * Set, change or remove an event's cover from event settings. The person
 * frames the photo at 16:9 in the cover crop; it is cropped and re-encoded as
 * JPEG on device before upload, which also converts HEIC from the camera roll.
 */
export const useChangeEventCover = (eventId: string, hasCover: boolean) => {
  const setCoverMutation = useSetEventCoverMutation(eventId);
  const removeCoverMutation = useRemoveEventCoverMutation(eventId);
  const [isPreparing, setIsPreparing] = useState(false);
  // The photo being framed in the cover crop.
  const [picked, setPicked] = useState<PickedImage | null>(null);
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
      Alert.alert(title, getErrorMessage(error, "Please try again."));
    } finally {
      setIsPreparing(false);
      inFlight.current = false;
    }
  };

  const pickFrom = async (source: PhotoSource) => {
    // Don't ask for a photo that couldn't be uploaded yet.
    if (Date.now() < rateLimitedUntil.current) {
      showRateLimited();
      return;
    }
    try {
      const asset = await pickPhoto(source);
      if (asset) setPicked({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch (error) {
      Alert.alert("Could not update cover", getErrorMessage(error, "Please try again."));
    }
  };

  const upload = (photo: PickedImage, crop: CropRect) =>
    run("Could not update cover", async () => {
      setIsPreparing(true);
      const image = await prepareCoverImage(photo, crop);
      await setCoverMutation.mutateAsync(image);
    });

  const removeCover = () =>
    run("Could not remove cover", async () => {
      await removeCoverMutation.mutateAsync();
    });

  const handleChangeCover = () => {
    if (isUpdatingCover) return;
    Alert.alert("Cover Photo", undefined, [
      { text: "Take Photo", onPress: () => void pickFrom("camera") },
      { text: "Choose from Library", onPress: () => void pickFrom("library") },
      ...(hasCover ? [{ text: "Remove Cover", style: "destructive" as const, onPress: removeCover }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return {
    isUpdatingCover,
    handleChangeCover,
    coverCrop: {
      photo: picked,
      onCancel: () => setPicked(null),
      onUse: (crop: CropRect) => {
        if (!picked) return;
        setPicked(null);
        void upload(picked, crop);
      },
    },
  };
};
