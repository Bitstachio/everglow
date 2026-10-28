import type { CropRect, PickedImage } from "@/lib/prepare-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { prepareCoverImage, type CoverImage } from "../lib/cover-image";

type PhotoSource = "camera" | "library";

// Not cropped here: iOS's editor only crops square, so the cover crop frames it at 16:9.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };

/**
 * 04.5 The new roll's first frame. The person frames it at 16:9, then it is
 * cropped and re-encoded on the device, and uploaded once the roll has been
 * loaded.
 */
export const useNewRollCover = () => {
  const { t } = useTranslation("create");
  const [cover, setCover] = useState<CoverImage | null>(null);
  // The photo being framed in the cover crop.
  const [picked, setPicked] = useState<PickedImage | null>(null);
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
      if (asset) setPicked({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch {
      Alert.alert(t("cover.failed"));
    }
  };

  const prepare = async (photo: PickedImage, crop: CropRect) => {
    setPicked(null);
    setIsPreparing(true);
    try {
      setCover(await prepareCoverImage(photo, crop));
    } catch {
      Alert.alert(t("cover.failed"));
    } finally {
      setIsPreparing(false);
    }
  };

  return {
    cover,
    isPreparing,
    crop: {
      photo: picked,
      onCancel: () => setPicked(null),
      onUse: (crop: CropRect) => {
        if (picked) void prepare(picked, crop);
      },
    },
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
