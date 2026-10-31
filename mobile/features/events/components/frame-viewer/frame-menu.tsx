import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DownloadSimple, ShareNetwork, Trash } from "phosphor-react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { EdgePrint } from "@/components/ui/edge-print";
import { SheetAction } from "@/components/ui/sheet-action";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import type { SheetFrame } from "../../lib/roll-page";

/** Chapter 09's frame summary and action index, without the removed frame numbers. */
export const FrameMenu = ({
  frame,
  name,
  time,
  isOwn,
  canDelete,
  visible,
  onClose,
  onClosed,
  onSave,
  onShare,
  onDelete,
}: {
  frame: SheetFrame | null;
  name: string;
  time: string;
  isOwn: boolean;
  canDelete: boolean;
  visible: boolean;
  onClose: () => void;
  onClosed: () => void;
  onSave: () => void;
  onShare: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation("roll");
  return (
    <BottomSheet testID="frame-menu-dialog" visible={visible} onClose={onClose} onClosed={onClosed}>
      <View>
        <View className="flex-row items-center gap-3 border-b border-line pb-4">
          <View className="size-12 overflow-hidden rounded-frame">
            <RetryingPhoto
              uri={frame?.photo.thumbnailUrl}
              cacheKey={frame ? `photo:${frame.photo.id}:thumbnail` : undefined}
              className="h-full w-full"
              contentFit="cover"
            />
          </View>
          <View className="flex-1 gap-1">
            <Text className="font-sans-medium text-name text-text">
              {isOwn ? t("viewer.ownFrame") : t("viewer.someoneFrame", { name })}
            </Text>
            <EdgePrint size="frame-label">
              {t("viewer.byline", { name: isOwn ? t("frame.you") : name, time })}
            </EdgePrint>
            {frame?.uploader?.username ? <EdgePrint size="frame-label">@{frame.uploader.username}</EdgePrint> : null}
          </View>
        </View>
        <SheetAction label={t("viewer.save")} icon={DownloadSimple} onPress={onSave} />
        <SheetAction label={t("gallery.share")} icon={ShareNetwork} onPress={onShare} />
        {canDelete ? (
          <SheetAction
            label={isOwn ? t("viewer.deleteOwn") : t("viewer.deleteOther", { name })}
            icon={Trash}
            onPress={onDelete}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
};
