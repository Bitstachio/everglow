import { Modal, View, FlatList, Pressable, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { AppIcon } from "@/components/ui/app-icon";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { RetryingPhoto } from "@/components/ui/retrying-photo";
import { Sprockets } from "@/components/ui/film-strip";
import { X, DotsThree } from "phosphor-react-native";
import { colorTokens } from "@/theme/tokens";
import type { SheetFrame } from "../../lib/roll-page";
import { GalleryDeleteSheet } from "../gallery-delete-sheet";
import { FilmGrain } from "@/components/ui/film-grain";
import { GalleryProgress } from "../gallery-controls";
import { FrameMenu } from "./frame-menu";
import { FramePager } from "./frame-pager";
import { useFrameViewer } from "./use-frame-viewer";
import type { PhotoResponseDto } from "../../types";

type Props = {
  frame: SheetFrame | null;
  frames: SheetFrame[];
  canDelete: boolean;
  isOwn: boolean;
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

/**
 * Chapter 09's viewer. Frames slide on the UI thread; the current frame and
 * one on each side load their originals, two on each side keep thumbnails.
 */
export const FrameViewer = (props: Props) => {
  const { frame, frames, busy } = props;
  const { t, i18n } = useTranslation("roll");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stripStep = Math.floor(width / 5);
  const index = frames.findIndex((item) => item.photo.id === frame?.photo.id);
  const moveTo = (page: number) => {
    const target = frames[page];
    if (target && target.photo.id !== frame?.photo.id) props.onMove(target.photo.id);
  };
  const {
    stripRef,
    pager,
    fadeMs,
    menuVisible,
    openMenu,
    closeMenu,
    fromMenu,
    onMenuClosed,
    closing,
    requestClose,
    onDismiss,
  } = useFrameViewer({
    index,
    count: frames.length,
    stripStep,
    width,
    onSelectPage: moveTo,
    frameId: frame?.photo.id ?? null,
    onClose: props.onClose,
    hasMore: props.hasMore,
    onLoadMore: props.onLoadMore,
  });
  const uploader = frame?.uploader;
  const name = uploader?.name ?? frame?.by ?? t("gallery.unknownUploader");
  const time = frame
    ? new Date(frame.photo.createdAt).toLocaleString(i18n.language, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";
  // Access changes clear the viewer immediately; ordinary closes retain its
  // contents until the native fade completes and invokes onDismiss.
  if (!frame) return null;
  const status = busy ? (
    <GalleryProgress label={props.progressLabel ?? t("gallery.preparing")} />
  ) : props.notice ? (
    <EdgePrint accessibilityLiveRegion="polite" className="px-5 py-3 text-center">
      {props.notice}
    </EdgePrint>
  ) : null;
  return (
    <Modal
      testID="frame-viewer-dialog"
      visible={!closing}
      animationType="fade"
      onRequestClose={requestClose}
      onDismiss={onDismiss}
      presentationStyle="fullScreen"
    >
      {/* Gestures inside a native modal need their own root. */}
      <GestureHandlerRootView className="flex-1">
        <View className="flex-1 bg-viewer" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View className="absolute inset-0">
            <FilmGrain />
          </View>
          <Animated.View style={pager.chromeStyle}>
            <View className="min-h-14 flex-row items-center gap-3 px-5 py-2">
              <IconButton accessibilityLabel={t("viewer.close")} onPress={requestClose}>
                <AppIcon icon={X} size="sm" color={colorTokens.text} />
              </IconButton>
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={[name, uploader?.username ? `@${uploader.username}` : null, time]
                  .filter(Boolean)
                  .join(" · ")}
                accessibilityActions={[
                  { name: "decrement", label: t("gallery.previous") },
                  { name: "increment", label: t("gallery.next") },
                ]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === "increment") moveTo(index + 1);
                  if (nativeEvent.actionName === "decrement") moveTo(index - 1);
                }}
                className="min-h-11 flex-1 flex-row items-center gap-2"
              >
                <EdgePrint size="frame-label" numberOfLines={2} className="flex-1">
                  <EdgeValue>{name}</EdgeValue>
                  {" · "}
                  {time}
                </EdgePrint>
              </View>
              <IconButton accessibilityLabel={t("gallery.more")} disabled={busy} onPress={openMenu}>
                <AppIcon icon={DotsThree} size="sm" color={colorTokens.text} />
              </IconButton>
            </View>
          </Animated.View>
          <View className="flex-1">
            <FramePager
              frame={frame}
              frames={frames}
              index={index}
              width={width}
              label={t("gallery.photoBy", { name })}
              fadeMs={fadeMs}
              pager={pager}
              onRetry={props.onRetry}
            />
            {/* Progress and results sit over the photo instead of pushing it
                up: resizing the photo mid-save reloaded the original. */}
            {status || props.failedSaveCount > 0 ? (
              <View
                testID="frame-viewer-status"
                className="bg-scrim"
                style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
              >
                {status}
                {props.failedSaveCount > 0 ? (
                  <Button
                    title={t("gallery.retrySave", { count: props.failedSaveCount })}
                    variant="ghost"
                    fullWidth={false}
                    disabled={busy}
                    onPress={props.onRetrySave}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
          <Animated.View style={pager.chromeStyle}>
            <View testID="viewer-film-strip" className="bg-rebate py-3.25">
              <Sprockets edge="top" />
              <FlatList
                ref={stripRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                data={frames}
                keyExtractor={(item) => item.photo.id}
                extraData={frame?.photo.id}
                style={{ flexGrow: 0 }}
                initialScrollIndex={Math.max(0, index - 2)}
                getItemLayout={(_, itemIndex) => ({
                  length: stripStep,
                  offset: stripStep * itemIndex,
                  index: itemIndex,
                })}
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
                    style={{
                      width: stripStep - 4,
                      height: Math.round(((stripStep - 4) * 9) / 11),
                      marginHorizontal: 2,
                    }}
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
              <Sprockets edge="bottom" />
            </View>
            <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
              <Button
                title={t("viewer.saveAction")}
                accessibilityLabel={t("viewer.save")}
                variant="ghost"
                fullWidth={false}
                onPress={props.onSave}
                disabled={busy}
              />
              <Button
                title={t("viewer.shareAction")}
                accessibilityLabel={t("gallery.share")}
                variant="ghost"
                fullWidth={false}
                onPress={props.onShare}
                disabled={busy}
              />
              <Button
                title={t("viewer.moreAction")}
                accessibilityLabel={t("gallery.more")}
                variant="ghost"
                fullWidth={false}
                onPress={openMenu}
                disabled={busy}
              />
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
      <FrameMenu
        frame={frame}
        name={name}
        time={time}
        isOwn={props.isOwn}
        canDelete={props.canDelete}
        visible={menuVisible && !!frame}
        onClose={closeMenu}
        onClosed={onMenuClosed}
        onSave={() => fromMenu(props.onSave)}
        onShare={() => fromMenu(props.onShare)}
        onDelete={() => fromMenu(props.onDelete)}
      />
      <GalleryDeleteSheet
        targets={props.deleteTargets}
        busy={props.isDeleting}
        onClose={props.onCancelDelete}
        onConfirm={props.onConfirmDelete}
      />
    </Modal>
  );
};
