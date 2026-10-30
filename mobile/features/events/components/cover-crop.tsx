import { PhotoCropper } from "@/components/photo-cropper";
import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { cropRect, type CropTransform, type Size } from "@/lib/photo-crop";
import type { CropRect, PickedImage } from "@/lib/prepare-image";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COVER_ASPECT } from "../lib/cover-image";

type CoverCropProps = {
  /** The photo to frame; the crop shows while there is one. */
  photo: PickedImage | null;
  onCancel: () => void;
  /** The framed 16:9 rectangle, in photo pixels. */
  onUse: (crop: CropRect) => void;
};

// The frame spans the screen less this gutter on each side, in points.
const FRAME_GUTTER = 20;

/**
 * 04.5 Move and scale the first frame: the photo under a 16:9 window, the
 * shape the cover has on Home, the envelope and the top of the roll. Laid
 * out like the avatar's crop (02.8).
 */
export const CoverCrop = ({ photo, onCancel, onUse }: CoverCropProps) => {
  const { t } = useTranslation("create");
  const { width: screenWidth } = useWindowDimensions();
  // A modal is its own native window, so the safe area is padded by hand, as the bottom sheet does.
  const insets = useSafeAreaInsets();
  const frameWidth = screenWidth - 2 * FRAME_GUTTER;
  const frame: Size = { width: frameWidth, height: (frameWidth * COVER_ASPECT[1]) / COVER_ASPECT[0] };
  const placement = useRef<{ area: Size; transform: CropTransform } | null>(null);

  const onUseFrame = () => {
    if (!photo || !placement.current) return;
    const { area, transform } = placement.current;
    onUse(cropRect(photo, area, frame, transform));
  };

  return (
    <Modal visible={photo !== null} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView className="flex-1 bg-viewer">
        {photo ? (
          <PhotoCropper
            uri={photo.uri}
            photo={photo}
            window={frame}
            fill="window"
            onChange={(area, transform) => {
              placement.current = { area, transform };
            }}
          />
        ) : null}
        <View
          pointerEvents="box-none"
          className="flex-1"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <View className="h-14 flex-row items-center justify-between px-3">
            <View>
              <Button title={t("cover.crop.cancel")} variant="ghost" fullWidth={false} onPress={onCancel} />
            </View>
            <EdgePrint>{t("cover.crop.title")}</EdgePrint>
            <View>
              <Button title={t("cover.crop.use")} variant="ghost" fullWidth={false} onPress={onUseFrame} />
            </View>
          </View>
          <View pointerEvents="none" className="mt-auto px-5 pb-6">
            <EdgePrint className="text-center">{t("cover.crop.hint")}</EdgePrint>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};
