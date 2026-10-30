import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import { Slip } from "@/components/ui/slip";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useTranslation } from "react-i18next";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SheetFrame } from "../lib/roll-page";

type FrameViewerProps = {
  /** Null while no frame is open. */
  frame: SheetFrame | null;
  canDelete: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  confirmDeleteVisible: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

/** One frame full size, on black: save it, or delete it if it's yours or you host. */
export const FrameViewer = ({
  frame,
  canDelete,
  isSaving,
  isDeleting,
  confirmDeleteVisible,
  onClose,
  onSave,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
}: FrameViewerProps) => {
  const { t } = useTranslation("roll");
  // A full-screen modal gets no inset from SafeAreaView, so pad from the root insets.
  const insets = useSafeAreaInsets();
  const edge = frame
    ? frame.by
      ? t("frame.edgeBy", { number: frame.number, name: frame.by })
      : t("frame.edge", { number: frame.number })
    : "";

  return (
    <Modal visible={frame !== null} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      <View className="flex-1 bg-viewer" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <TopBar title={edge} left={<BackButton accessibilityLabel={t("viewer.close")} onPress={onClose} />} />
        <View className="flex-1">
          {frame ? (
            <Photo
              testID="frame-viewer-photo"
              accessibilityLabel={edge}
              source={{ uri: frame.photo.url, cacheKey: `photo:${frame.photo.id}:original` }}
              contentFit="contain"
              className="h-full w-full"
            />
          ) : null}
        </View>
        <View className="gap-2.5 px-5 pb-2 pt-4">
          <Button title={t("viewer.save")} variant="secondary" mark="↓" onPress={onSave} isLoading={isSaving} />
          {canDelete ? <Button title={t("viewer.delete")} variant="ghost" onPress={onDelete} /> : null}
        </View>
      </View>

      <BottomSheet visible={confirmDeleteVisible} onClose={onCancelDelete}>
        <Slip edge={edge} title={t("viewer.deleteTitle", { number: frame?.number ?? 0 })} body={t("viewer.deleteBody")}>
          <Button title={t("viewer.deleteConfirm")} variant="danger" onPress={onConfirmDelete} isLoading={isDeleting} />
          <Button title={t("viewer.deleteCancel")} variant="secondary" mark="‹" onPress={onCancelDelete} />
        </Slip>
      </BottomSheet>
    </Modal>
  );
};
