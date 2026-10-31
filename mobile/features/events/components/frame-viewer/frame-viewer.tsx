import { Modal, View, Text, FlatList, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner } from "@/components/ui/spinner";
import { Avatar } from "@/components/ui/avatar";
import { AppIcon } from "@/components/ui/app-icon";
import { IconButton } from "@/components/ui/icon-button";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { IndexRow } from "@/components/ui/index-row";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { Sprockets } from "@/components/ui/film-strip";
import { X, DotsThree, CaretLeft, CaretRight } from "phosphor-react-native";
import { colorTokens } from "@/theme/tokens";
import type { SheetFrame } from "../../lib/roll-page";
import { FramePhoto } from "../frame-photo/frame-photo";
import { GalleryDeleteSheet } from "../gallery-delete-sheet";
import { useFrameViewer } from "./use-frame-viewer";
import type { PhotoResponseDto } from "../../types";

type Props = {
  frame: SheetFrame | null;
  frames: SheetFrame[];
  canDelete: boolean;
  busy: boolean;
  notice: string | null;
  progressLabel?: string;
  failedSaveCount: number;
  onRetrySave: () => void;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onSave: () => void;
  onShare: () => void;
  onDelete: () => void;
  onMove: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  deleteTargets: PhotoResponseDto[] | null;
  isDeleting: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

/** Only the active frame requests its original; navigation and the film strip use thumbnails. */
export const FrameViewer = (props: Props) => {
  const { frame, frames, busy } = props;
  const { t, i18n } = useTranslation("roll");
  const insets = useSafeAreaInsets();
  const index = frames.findIndex((item) => item.photo.id === frame?.photo.id);
  const move = (offset: number) => {
    const target = frames[index + offset];
    if (target) props.onMove(target.photo.id);
    if (index + offset >= frames.length - 3 && props.hasMore) props.onLoadMore();
  };
  const { stripRef, gesture, menuVisible, openMenu, closeMenu, fromMenu, onMenuClosed } = useFrameViewer(
    () => move(-1),
    () => move(1),
    index,
  );
  const uploader = frame?.uploader;
  const name = uploader?.name ?? frame?.by ?? t("gallery.unknownUploader");
  const time = frame
    ? new Date(frame.photo.createdAt).toLocaleString(i18n.language, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <Modal visible={frame !== null} animationType="fade" onRequestClose={props.onClose} presentationStyle="fullScreen">
      <View className="flex-1 bg-viewer" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <IconButton accessibilityLabel={t("viewer.close")} onPress={props.onClose}>
            <AppIcon icon={X} size="sm" color={colorTokens.text} />
          </IconButton>
          {uploader ? (
            <Avatar userId={uploader.userId} name={uploader.name} uri={uploader.avatarUrl} size="header" />
          ) : null}
          <View className="flex-1 gap-1">
            <Text className="font-sans-medium text-name text-text" numberOfLines={1}>
              {name}
            </Text>
            <EdgePrint size="frame-label" numberOfLines={1}>
              {[uploader?.username ? `@${uploader.username}` : null, time].filter(Boolean).join(" · ")}
            </EdgePrint>
          </View>
          <IconButton accessibilityLabel={t("gallery.more")} disabled={busy} onPress={openMenu}>
            <AppIcon icon={DotsThree} size="sm" color={colorTokens.text} />
          </IconButton>
        </View>
        <View className="flex-1" {...gesture}>
          {frame ? (
            <FramePhoto
              key={`${frame.photo.id}:${frame.photo.url}`}
              frame={frame}
              label={t("gallery.photoBy", { name })}
              onRetry={props.onRetry}
            />
          ) : null}
        </View>
        <View className="flex-row items-center justify-between px-4 py-1">
          <IconButton accessibilityLabel={t("gallery.previous")} disabled={index <= 0} onPress={() => move(-1)}>
            <AppIcon icon={CaretLeft} size="sm" color={colorTokens.text} />
          </IconButton>
          <View className="flex-1 items-center">
            {busy ? (
              <Spinner label={props.progressLabel ?? t("gallery.preparing")} />
            ) : (
              <EdgePrint accessibilityLiveRegion="polite" className="text-center">
                {props.notice}
              </EdgePrint>
            )}
          </View>
          <IconButton
            accessibilityLabel={t("gallery.next")}
            disabled={index >= frames.length - 1 && !props.hasMore}
            onPress={() => move(1)}
          >
            <AppIcon icon={CaretRight} size="sm" color={colorTokens.text} />
          </IconButton>
        </View>
        {props.failedSaveCount > 0 ? (
          <Button
            title={t("gallery.retrySave", { count: props.failedSaveCount })}
            variant="ghost"
            fullWidth={false}
            disabled={busy}
            onPress={props.onRetrySave}
          />
        ) : null}
        <Sprockets edge="top" count={24} />
        <FlatList
          ref={stripRef}
          horizontal
          data={frames}
          keyExtractor={(item) => item.photo.id}
          extraData={frame?.photo.id}
          style={{ flexGrow: 0 }}
          initialScrollIndex={Math.max(0, index)}
          getItemLayout={(_, itemIndex) => ({ length: 68, offset: 68 * itemIndex, index: itemIndex })}
          onEndReached={props.onLoadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={t("frame.labelBy", {
                number: item.number,
                name: item.by ?? t("gallery.unknownUploader"),
              })}
              accessibilityState={{ selected: item.photo.id === frame?.photo.id }}
              onPress={() => props.onMove(item.photo.id)}
              style={{ width: 64, height: 64, marginHorizontal: 2 }}
              className={item.photo.id === frame?.photo.id ? "border-2 border-text" : "opacity-50"}
            >
              <RetryingPhoto
                uri={item.photo.thumbnailUrl}
                cacheKey={`photo:${item.photo.id}:thumbnail`}
                className="h-full w-full"
                contentFit="cover"
              />
            </Pressable>
          )}
        />
        <Sprockets edge="bottom" count={24} />
        <View className="flex-row items-center justify-around px-4 py-2">
          <Button
            title={t("viewer.save")}
            variant="ghost"
            fullWidth={false}
            mark="↓"
            onPress={props.onSave}
            disabled={busy}
          />
          <Button
            title={t("gallery.share")}
            variant="ghost"
            fullWidth={false}
            mark="↗"
            onPress={props.onShare}
            disabled={busy}
          />
          <Button
            title={t("gallery.more")}
            variant="ghost"
            fullWidth={false}
            mark="⋯"
            onPress={openMenu}
            disabled={busy}
          />
        </View>
      </View>
      <BottomSheet
        testID="frame-menu-dialog"
        visible={menuVisible && !!frame}
        onClose={closeMenu}
        onClosed={onMenuClosed}
      >
        <View className="px-5 pb-5">
          <View className="flex-row items-center gap-4 pb-4">
            <View className="h-16 w-16">
              <RetryingPhoto
                uri={frame?.photo.thumbnailUrl}
                cacheKey={frame ? `photo:${frame.photo.id}:thumbnail` : undefined}
                className="h-full w-full"
              />
            </View>
            <View className="flex-1">
              <Text className="font-sans-medium text-name text-text">{name}</Text>
              <EdgePrint>{time}</EdgePrint>
            </View>
          </View>
          <IndexRow label={t("viewer.save")} onPress={() => fromMenu(props.onSave)} />
          <IndexRow label={t("gallery.share")} onPress={() => fromMenu(props.onShare)} />
          {props.canDelete ? (
            <IndexRow label={t("viewer.delete")} muted onPress={() => fromMenu(props.onDelete)} />
          ) : null}
        </View>
      </BottomSheet>
      <GalleryDeleteSheet
        targets={props.deleteTargets}
        busy={props.isDeleting}
        onClose={props.onCancelDelete}
        onConfirm={props.onConfirmDelete}
      />
    </Modal>
  );
};
