import { SheetAction } from "@/components/ui/sheet-action";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Flag, QrCode, Scissors, SignOut, SlidersHorizontal, Tray, Users } from "phosphor-react-native";
import type { RollRole } from "../lib/roll-page";

type RollMenuProps = {
  role: RollRole;
  /** Hosts manage settings except on a suspended roll. */
  canOpenSettings: boolean;
  /** Cut while the gallery is still open (or upcoming). */
  canCut: boolean;
  /** Reports to check, for a host who can review them; left out hides the row. */
  reports?: { toCheck: number; onOpen: () => void };
  onSendEnvelope: () => void;
  onOpenRollCall: () => void;
  onOpenSettings: () => void;
  onCut: () => void;
  onReportRoll: () => void;
  onLeave: () => void;
};

/** The roll’s ⋯ menu. Host and guest see different rows. */
export const RollMenu = ({
  role,
  canOpenSettings,
  canCut,
  reports,
  onSendEnvelope,
  onOpenRollCall,
  onOpenSettings,
  onCut,
  onReportRoll,
  onLeave,
}: RollMenuProps) => {
  const { t } = useTranslation(["roll", "report"]);

  if (role === "host") {
    return (
      <View testID="roll-menu">
        <SheetAction label={t("menuSheet.sendEnvelope")} icon={QrCode} onPress={onSendEnvelope} />
        {reports ? (
          <SheetAction
            label={
              reports.toCheck
                ? t("report:menu.reportsToCheck", { count: reports.toCheck })
                : t("report:menu.reports")
            }
            icon={Tray}
            onPress={reports.onOpen}
          />
        ) : null}
        <SheetAction label={t("menuSheet.rollCall")} icon={Users} onPress={onOpenRollCall} />
        {canOpenSettings ? (
          <SheetAction label={t("menuSheet.settings")} icon={SlidersHorizontal} onPress={onOpenSettings} />
        ) : null}
        {canCut ? <SheetAction label={t("menuSheet.cut")} icon={Scissors} onPress={onCut} /> : null}
        <SheetAction label={t("menuSheet.leave")} icon={SignOut} onPress={onLeave} />
      </View>
    );
  }

  return (
    <View testID="roll-menu">
      <SheetAction label={t("menuSheet.rollCall")} icon={Users} onPress={onOpenRollCall} />
      <SheetAction label={t("report:menu.reportRoll")} icon={Flag} onPress={onReportRoll} />
      <SheetAction label={t("menuSheet.leave")} icon={SignOut} onPress={onLeave} />
    </View>
  );
};
