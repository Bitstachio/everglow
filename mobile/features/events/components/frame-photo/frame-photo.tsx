import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Photo } from "@/components/ui/photo";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { EdgePrint } from "@/components/ui/edge-print";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SheetFrame } from "../../lib/roll-page";
import { useFramePhoto } from "./use-frame-photo";

/**
 * One frame in the viewer: its thumbnail underneath, and its original on top
 * when the pager asks for it. The thumbnail stays mounted the whole time, so
 * the frame is never blank while the original loads, reloads or renews. Only
 * the current frame shows loading and failure, and can be retried.
 */
export const FramePhoto = ({
  frame,
  label,
  active,
  original,
  fadeMs,
  onRetry,
}: {
  frame: SheetFrame;
  label: string;
  /** The frame on screen, rather than a neighbour kept ready. */
  active: boolean;
  /** Load the original as well as the thumbnail. */
  original: boolean;
  /** How long the original takes to fade in over the thumbnail. */
  fadeMs: number;
  onRetry: () => Promise<void>;
}) => {
  const { t } = useTranslation("roll");
  const { status, attempt, refreshing, retry, fail, onDisplay, originalUri, thumbnailUri } = useFramePhoto({
    photo: frame.photo,
    active,
    onRetry,
  });

  return (
    <View className="flex-1">
      <View className="absolute inset-0">
        <RetryingPhoto
          testID={active ? "frame-viewer-thumbnail" : `frame-preview-${frame.photo.id}`}
          uri={thumbnailUri}
          cacheKey={`photo:${frame.photo.id}:thumbnail`}
          contentFit="contain"
          className="h-full w-full"
        />
      </View>
      {original && status !== "failed" && !refreshing ? (
        <Photo
          key={attempt}
          testID={active ? "frame-viewer-photo" : `frame-original-${frame.photo.id}`}
          accessibilityLabel={active ? label : undefined}
          source={{ uri: originalUri, cacheKey: `photo:${frame.photo.id}:original` }}
          transition={{ duration: fadeMs, effect: "cross-dissolve" }}
          contentFit="contain"
          className="h-full w-full"
          onDisplay={onDisplay}
          onError={fail}
        />
      ) : null}
      {active && status === "loading" ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Spinner tone="foreground" label={t("viewer.loading")} />
        </View>
      ) : null}
      {active && status === "failed" ? (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-viewer px-5">
          <EdgePrint tone="text">{t("viewer.loadFailed")}</EdgePrint>
          <Button title={t("viewer.retry")} variant="ghost" isLoading={refreshing} onPress={() => void retry()} />
        </View>
      ) : null}
    </View>
  );
};
