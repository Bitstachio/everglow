import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useLabCard } from "./use-lab-card";

type PhotoSource = "camera" | "library";

/**
 * 02.7 Your photo. Onboarding is already complete; the photo is optional.
 * The picked photo goes to the move-and-scale crop; Skip goes to the card.
 */
export const useOnboardingPhotoScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const { card } = useLabCard();

  const pick = async (source: PhotoSource) => {
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("photo.permissionTitle"), t(source === "camera" ? "photo.cameraDenied" : "photo.libraryDenied"));
        return;
      }
      // Not cropped here: the crop screen frames it on the card's circle.
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      router.push({
        pathname: "/onboarding/crop",
        params: { uri: asset.uri, width: String(asset.width), height: String(asset.height) },
      });
    } catch {
      Alert.alert(t("photo.failedTitle"), t("common:actions.tryAgain"));
    }
  };

  return {
    card,
    takePhoto: () => void pick("camera"),
    chooseFromLibrary: () => void pick("library"),
    skip: () => router.replace("/onboarding/ready"),
  };
};
