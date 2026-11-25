import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Flag, Prohibit, Trash } from "phosphor-react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { MenuAction } from "@/components/ui/menu-action";
import { firstName, type SheetFrame } from "../../lib/roll-page";

/** Whether More has any actions (Save/Share live on the viewer bar). */
export const frameMenuHasActions = ({
  canDelete,
  onReport,
  onBlock,
}: {
  canDelete: boolean;
  onReport?: unknown;
  onBlock?: unknown;
}): boolean => canDelete || Boolean(onReport) || Boolean(onBlock);

/**
 * Overflow actions for the open photo. Save and Share stay on the viewer bar;
 * someone else's frame can be reported, and its owner blocked.
 */
export const FrameMenu = ({
  frame,
  name,
  isOwn,
  canDelete,
  visible,
  onClose,
  onClosed,
  onDelete,
  onReport,
  onBlock,
}: {
  frame: SheetFrame | null;
  name: string;
  isOwn: boolean;
  canDelete: boolean;
  visible: boolean;
  onClose: () => void;
  onClosed: () => void;
  onDelete: () => void;
  /** Left out for your own frame: you can't report it. */
  onReport?: () => void;
  /** Left out for your own frame, and when its owner is off the roll or already blocked. */
  onBlock?: () => void;
}) => {
  const { t } = useTranslation(["event", "report"]);
  return (
    <BottomSheet testID="frame-menu-dialog" visible={visible} onClose={onClose} onClosed={onClosed}>
      <View>
        {canDelete ? (
          <MenuAction
            first
            label={
              isOwn
                ? t("viewer.deleteOwn")
                : frame?.deleted
                  ? t("viewer.deleteDeleted")
                  : t("viewer.deleteOther", { name })
            }
            icon={Trash}
            onPress={onDelete}
          />
        ) : null}
        {onReport ? (
          <MenuAction
            first={!canDelete}
            label={t("report:menu.reportPhoto")}
            icon={Flag}
            onPress={onReport}
          />
        ) : null}
        {onBlock ? (
          <MenuAction
            first={!canDelete && !onReport}
            muted
            label={t("report:menu.block", { name: firstName(name) })}
            icon={Prohibit}
            onPress={onBlock}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
};
