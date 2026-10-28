import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { COVER_ASPECT, prepareCoverImage, type CoverImage } from "../lib/cover-image";

type PhotoSource = "camera" | "library";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: COVER_ASPECT,
  quality: 1,
};

/**
 * 04.5 The new roll's first frame. It is cropped to 16:9 and re-encoded on
 * the device now, and uploaded once the roll has been loaded.
 */
export const useNewRollCover = () => {
  const { t } = useTranslation("create");
  const [cover, setCover] = useState<CoverImage | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  const pick = async (source: PhotoSource) => {
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("cover.permissionTitle"), t(source === "camera" ? "cover.cameraDenied" : "cover.libraryDenied"));
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setIsPreparing(true);
      setCover(await prepareCoverImage(asset));
    } catch {
      Alert.alert(t("cover.failed"));
    } finally {
      setIsPreparing(false);
    }
  };

  return {
    cover,
    isPreparing,
    onPickCover: () => {
      if (isPreparing) return;
      Alert.alert(t("cover.menuTitle"), undefined, [
        { text: t("cover.take"), onPress: () => void pick("camera") },
        { text: t("cover.choose"), onPress: () => void pick("library") },
        ...(cover ? [{ text: t("cover.remove"), style: "destructive" as const, onPress: () => setCover(null) }] : []),
        { text: t("cover.cancel"), style: "cancel" as const },
      ]);
    },
  };
};
