import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { Photo } from "@/components/ui/photo";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SheetFrame } from "../lib/roll-page";

type FrameViewerProps = {
  /** Null while no frame is open. */
  frame: SheetFrame | null;
  canDelete: boolean;
  isSaving: boolean;
  /** False while another save runs, such as Save all. */
  canSave: boolean;
  isDeleting: boolean;
  confirmDeleteVisible: boolean;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onSave: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

/** Keep an original request visible and recoverable, including a request that stalls. */
const FramePhoto = ({ frame, label, onRetry }: { frame: SheetFrame; label: string; onRetry: () => Promise<void> }) => {
  const { t } = useTranslation("roll");
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fail = (reason: "image_error" | "timeout") => {
    setStatus("failed");
    // Native image errors may contain signed URLs. Log identifiers and a safe reason only.
    if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: frame.photo.id, reason });
  };

  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => {
      setStatus("failed");
      if (__DEV__) console.warn("photo.viewer.load_failed", { photoId: frame.photo.id, reason: "timeout" });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [status, attempt, frame.photo.id]);

  const retry = async () => {
    setRefreshing(true);
    try {
      // Renew the signature as well as remounting the image; the old URL may have expired.
      await onRetry();
      setAttempt((current) => current + 1);
      setStatus("loading");
    } catch {
      setStatus("failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View className="flex-1">
      {status !== "failed" ? (
        <Photo
          key={attempt}
          testID="frame-viewer-photo"
          accessibilityLabel={label}
          source={{ uri: frame.photo.url, cacheKey: `photo:${frame.photo.id}:original` }}
          contentFit="contain"
          className="h-full w-full"
          onDisplay={() => setStatus("loaded")}
          onError={() => fail("image_error")}
        />
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

/** One frame full size, on black: save it, or delete it if it's yours or you host. */
export const FrameViewer = ({
  frame,
  canDelete,
  isSaving,
  canSave,
  isDeleting,
  confirmDeleteVisible,
  onClose,
  onRetry,
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
            <FramePhoto key={`${frame.photo.id}:${frame.photo.url}`} frame={frame} label={edge} onRetry={onRetry} />
          ) : null}
        </View>
        <View className="gap-2.5 px-5 pb-2 pt-4">
          <Button
            title={t("viewer.save")}
            variant="secondary"
            mark="↓"
            onPress={onSave}
            isLoading={isSaving}
            disabled={!canSave}
          />
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
