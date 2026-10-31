import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DownloadSimple, ShareNetwork, Trash } from "phosphor-react-native";
import type { ComponentProps } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { EdgePrint } from "@/components/ui/edge-print";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { colorTokens } from "@/theme/tokens";
import type { SheetFrame } from "../../lib/roll-page";

const FrameAction = ({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof AppIcon>["icon"];
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    className="min-h-12 flex-row items-center justify-between gap-4 border-t border-line py-4 active:opacity-60"
  >
    <EdgePrint tone="text" className="flex-1">
      {label}
    </EdgePrint>
    <AppIcon icon={icon} size="sm" color={colorTokens.text} />
  </Pressable>
);

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
        <FrameAction label={t("viewer.save")} icon={DownloadSimple} onPress={onSave} />
        <FrameAction label={t("gallery.share")} icon={ShareNetwork} onPress={onShare} />
        {canDelete ? (
          <FrameAction
            label={isOwn ? t("viewer.deleteOwn") : t("viewer.deleteOther", { name })}
            icon={Trash}
            onPress={onDelete}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
};
