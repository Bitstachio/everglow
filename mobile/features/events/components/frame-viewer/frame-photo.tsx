import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Photo } from "@/components/ui/photo";
import { EdgePrint } from "@/components/ui/edge-print";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SheetFrame } from "../../lib/roll-page";
import { useFramePhoto } from "./use-frame-photo";

/** The open frame's original over its thumbnail, kept visible and recoverable, including a request that stalls. */
export const FramePhoto = ({
  frame,
  label,
  onRetry,
}: {
  frame: SheetFrame;
  label: string;
  onRetry: () => Promise<void>;
}) => {
  const { t } = useTranslation("roll");
  const { status, attempt, refreshing, retry, onProgress, onDisplay, onError } = useFramePhoto(frame.photo.id, onRetry);
  const thumbnail = { uri: frame.photo.thumbnailUrl, cacheKey: `photo:${frame.photo.id}:thumbnail` };

  return (
    <View className="flex-1">
      {status !== "failed" && !refreshing ? (
        <Photo
          key={attempt}
          testID="frame-viewer-photo"
          accessibilityLabel={label}
          source={{ uri: frame.photo.url, cacheKey: `photo:${frame.photo.id}:original` }}
          placeholder={thumbnail}
          placeholderContentFit="contain"
          contentFit="contain"
          className="h-full w-full"
          onProgress={onProgress}
          onDisplay={onDisplay}
          onError={onError}
        />
      ) : null}
      {status === "loading" && refreshing ? (
        // The thumbnail holds the place while the link is renewed.
        <Photo testID="frame-viewer-placeholder" source={thumbnail} contentFit="contain" className="h-full w-full" />
      ) : null}
      {status === "loading" ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Spinner tone="foreground" label={t("viewer.loading")} />
        </View>
      ) : null}
      {status === "failed" ? (
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <EdgePrint tone="text">{t("viewer.loadFailed")}</EdgePrint>
          <Button title={t("viewer.retry")} variant="ghost" isLoading={refreshing} onPress={() => void retry()} />
        </View>
      ) : null}
    </View>
  );
};
