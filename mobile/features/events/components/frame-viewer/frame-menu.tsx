import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DownloadSimple, Flag, Prohibit, ShareNetwork, Trash } from "phosphor-react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { EdgePrint } from "@/components/ui/edge-print";
import { MenuAction } from "@/components/ui/menu-action";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import type { SheetFrame } from "../../lib/roll-page";

/**
 * Chapter 09's frame summary and action index, without the removed frame
 * numbers. Someone else's frame can be reported, and its owner blocked (09.3).
 */
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
  onReport,
  onBlock,
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
  /** Left out for your own frame: you can't report it. */
  onReport?: () => void;
  /** Left out for your own frame, and for a frame whose owner left Everglow. */
  onBlock?: () => void;
}) => {
  const { t } = useTranslation(["roll", "report"]);
  return (
    <BottomSheet testID="frame-menu-dialog" visible={visible} onClose={onClose} onClosed={onClosed}>
      <View>
        <View className="flex-row items-center gap-3 pb-4">
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
        <MenuAction label={t("viewer.save")} icon={DownloadSimple} onPress={onSave} />
        <MenuAction label={t("gallery.share")} icon={ShareNetwork} onPress={onShare} />
        {canDelete ? (
          <MenuAction
            label={isOwn ? t("viewer.deleteOwn") : t("viewer.deleteOther", { name })}
            icon={Trash}
            onPress={onDelete}
          />
        ) : null}
        {onReport ? <MenuAction label={t("report:menu.reportFrame")} icon={Flag} onPress={onReport} /> : null}
        {onBlock ? <MenuAction muted label={t("report:menu.block", { name: name.split(" ")[0] })} icon={Prohibit} onPress={onBlock} /> : null}
      </View>
    </BottomSheet>
  );
};
