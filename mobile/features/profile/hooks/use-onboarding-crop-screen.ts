import { getErrorMessage } from "@/lib/api/errors";
import { cropRect, type CropTransform, type Size } from "@/lib/photo-crop";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useSetAvatarMutation } from "../api/mutations";
import { prepareAvatarImage } from "../lib/avatar-image";

/** The crop window's radius in points, as drawn (02.8). */
export const AVATAR_CROP_RADIUS = 150;

/**
 * 02.8 Move and scale. Use crops the framed square on the phone, uploads it
 * as the avatar and goes on to the finished card.
 */
export const useOnboardingCropScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const params = useLocalSearchParams<{ uri: string; width: string; height: string }>();
  const photo: Size = { width: Number(params.width), height: Number(params.height) };
  const placement = useRef<{ area: Size; transform: CropTransform } | null>(null);
  const setAvatar = useSetAvatarMutation();
  const [isPreparing, setIsPreparing] = useState(false);
  const isSaving = isPreparing || setAvatar.isPending;

  const onUse = async () => {
    if (!placement.current || isSaving) return;
    const { area, transform } = placement.current;
    setIsPreparing(true);
    try {
      const image = await prepareAvatarImage(
        { uri: params.uri, ...photo },
        cropRect(photo, area, { width: 2 * AVATAR_CROP_RADIUS, height: 2 * AVATAR_CROP_RADIUS }, transform),
      );
      await setAvatar.mutateAsync(image);
      router.replace("/onboarding/ready");
    } catch (err) {
      Alert.alert(t("crop.failedTitle"), getErrorMessage(err, t("common:actions.tryAgain")));
    } finally {
      setIsPreparing(false);
    }
  };

  return {
    uri: params.uri,
    photo,
    radius: AVATAR_CROP_RADIUS,
    isSaving,
    onPlace: (area: Size, transform: CropTransform) => {
      placement.current = { area, transform };
    },
    onCancel: () => router.back(),
    onUse: () => void onUse(),
  };
};
