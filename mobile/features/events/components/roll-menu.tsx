import { MenuAction } from "@/components/ui/menu-action";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Flag, QrCode, Scissors, SignOut, SlidersHorizontal, Trash, Users } from "phosphor-react-native";
import type { RollRole } from "../lib/roll-page";

type RollMenuProps = {
  role: RollRole;
  /** Hosts manage settings except on a suspended roll. */
  canOpenSettings: boolean;
  /** Cut while the gallery is still open (or upcoming). */
  canCut: boolean;
  /** Delete once it has closed, in Cut's place. */
  canDelete?: boolean;
  /** A host alone on a closed roll can't leave it (LAST_ORGANIZER), so the row goes. */
  canLeave?: boolean;
  /** Reports to check, for a host who can review them; left out hides the row. */
  reports?: { toCheck: number; onOpen: () => void };
  onSendEnvelope: () => void;
  onOpenRollCall: () => void;
  onOpenSettings: () => void;
  onCut: () => void;
  onDelete?: () => void;
  onReportRoll: () => void;
  onLeave: () => void;
};

/** The roll’s ⋯ menu. Hosts run the roll from it; everyone else can report the roll or leave. */
export const RollMenu = ({
  role,
  canOpenSettings,
  canCut,
  canDelete = false,
  canLeave = true,
  reports,
  onSendEnvelope,
  onOpenRollCall,
  onOpenSettings,
  onCut,
  onDelete,
  onReportRoll,
  onLeave,
}: RollMenuProps) => {
  const { t } = useTranslation(["roll", "report"]);

  if (role === "host") {
    return (
      <View testID="roll-menu">
        <MenuAction first label={t("menuSheet.sendEnvelope")} icon={QrCode} onPress={onSendEnvelope} />
        {reports ? (
          <MenuAction
            label={
              reports.toCheck ? t("report:menu.reportsToCheck", { count: reports.toCheck }) : t("report:menu.reports")
            }
            icon={Flag}
            onPress={reports.onOpen}
          />
        ) : null}
        <MenuAction label={t("menuSheet.rollCall")} icon={Users} onPress={onOpenRollCall} />
        {canOpenSettings ? (
          <MenuAction label={t("menuSheet.settings")} icon={SlidersHorizontal} onPress={onOpenSettings} />
        ) : null}
        {canCut ? <MenuAction label={t("menuSheet.cut")} icon={Scissors} onPress={onCut} /> : null}
        {canDelete && onDelete ? <MenuAction label={t("menuSheet.delete")} icon={Trash} onPress={onDelete} /> : null}
        {canLeave ? <MenuAction muted label={t("menuSheet.leave")} icon={SignOut} onPress={onLeave} /> : null}
      </View>
    );
  }

  return (
    <View testID="roll-menu">
      <MenuAction first label={t("menuSheet.rollCall")} icon={Users} onPress={onOpenRollCall} />
      <MenuAction label={t("report:menu.reportRoll")} icon={Flag} onPress={onReportRoll} />
      <MenuAction label={t("menuSheet.leave")} icon={SignOut} onPress={onLeave} />
    </View>
  );
};
