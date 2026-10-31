import { Pressable, View } from "react-native";
import { X } from "phosphor-react-native";
import { AppIcon } from "@/components/ui/app-icon";
import { IconButton } from "@/components/ui/icon-button";
import { colorTokens } from "@/theme/tokens";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EdgePrint } from "@/components/ui/edge-print";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";

/** In-flow feedback inside the footer, never a strip floating over the photos. */
export const GalleryProgress = ({ label, onStop }: { label: string; onStop?: () => void }) => {
  const { t } = useTranslation("roll");
  return (
    <View className="min-h-12 flex-row items-center justify-center gap-3 px-5 py-3">
      <Spinner label={label} />
      <EdgePrint tone="text" className="flex-shrink">
        {label}
      </EdgePrint>
      {onStop ? (
        <Button
          title={t("gallery.stop")}
          accessibilityLabel={t("gallery.stopLabel")}
          variant="ghost"
          fullWidth={false}
          onPress={onStop}
        />
      ) : null}
    </View>
  );
};

/** What the last save of several frames didn't save: try those again, or let them go. */
export const GalleryUnsaved = ({
  count,
  onRetry,
  onDismiss,
}: {
  count: number;
  onRetry: () => void;
  onDismiss: () => void;
}) => {
  const { t } = useTranslation("roll");
  return (
    <View className="min-h-12 flex-row items-center justify-center gap-3 px-5">
      <Button title={t("gallery.retrySave", { count })} variant="ghost" fullWidth={false} onPress={onRetry} />
      <IconButton accessibilityLabel={t("gallery.dismissUnsaved")} onPress={onDismiss}>
        <AppIcon icon={X} size="sm" color={colorTokens.text} />
      </IconButton>
    </View>
  );
};

export const GallerySelectionBar = ({
  count,
  deleteCount,
  busy,
  onSave,
  onShare,
  onDelete,
}: {
  count: number;
  deleteCount: number;
  busy: boolean;
  onSave: () => void;
  onShare: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation("roll");
  return (
    <View className="flex-row items-center justify-around border-t border-line bg-ground px-3 py-3">
      <Button
        title={t("gallery.saveCount", { count })}
        variant="ghost"
        fullWidth={false}
        disabled={busy || !count}
        onPress={onSave}
      />
      <Button
        title={t("gallery.share")}
        variant="ghost"
        fullWidth={false}
        disabled={busy || !count}
        onPress={onShare}
      />
      <Button
        title={t("gallery.deleteCount", { count: deleteCount })}
        variant="ghost"
        fullWidth={false}
        disabled={busy || !deleteCount}
        onPress={onDelete}
      />
    </View>
  );
};

export const SaveRollSheet = ({
  visible,
  count,
  ownCount,
  includeMine,
  onToggle,
  onClose,
  onClosed,
  onSave,
}: {
  visible: boolean;
  count: number;
  ownCount: number;
  includeMine: boolean;
  onToggle: () => void;
  onClose: () => void;
  onClosed: () => void;
  onSave: () => void;
}) => {
  const { t } = useTranslation("roll");
  return (
    <BottomSheet testID="save-roll-dialog" visible={visible} onClose={onClose} onClosed={onClosed}>
      <Slip edge={t("gallery.saveRoll")} title={t("gallery.saveTitle", { count })} body={t("gallery.saveBody")}>
        {ownCount > 0 ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includeMine }}
            accessibilityLabel={t("gallery.includeMine", { count: ownCount })}
            onPress={onToggle}
            className="min-h-12 flex-row items-center gap-3 py-3"
          >
            <View className="h-6 w-6 items-center justify-center border border-text">
              <EdgePrint>{includeMine ? "✓" : ""}</EdgePrint>
            </View>
            <EdgePrint tone="text">{t("gallery.includeMine", { count: ownCount })}</EdgePrint>
          </Pressable>
        ) : null}
        <Button title={t("gallery.saveCount", { count })} disabled={!count} onPress={onSave} />
        <Button title={t("gallery.cancel")} variant="secondary" onPress={onClose} />
      </Slip>
    </BottomSheet>
  );
};
