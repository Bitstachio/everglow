import { SheetAction } from "@/components/ui/sheet-action";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { QrCode, Scissors, SignOut, SlidersHorizontal, Users } from "phosphor-react-native";
import type { RollRole } from "../lib/roll-page";

type RollMenuProps = {
  role: RollRole;
  /** Hosts manage settings except on a suspended roll. */
  canOpenSettings: boolean;
  /** Cut while the gallery is still open (or upcoming). */
  canCut: boolean;
  onSendEnvelope: () => void;
  onOpenRollCall: () => void;
  onOpenSettings: () => void;
  onCut: () => void;
  onLeave: () => void;
};

/**
 * The roll’s ⋯ menu. Host and guest see different rows.
 * TODO: Add a Reports row when the reports UI ships.
 */
export const RollMenu = ({
  role,
  canOpenSettings,
  canCut,
  onSendEnvelope,
  onOpenRollCall,
  onOpenSettings,
  onCut,
  onLeave,
}: RollMenuProps) => {
  const { t } = useTranslation("roll");

  if (role === "host") {
    return (
      <View testID="roll-menu">
        <SheetAction label={t("menuSheet.sendEnvelope")} icon={QrCode} onPress={onSendEnvelope} />
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
      <SheetAction label={t("menuSheet.leave")} icon={SignOut} onPress={onLeave} />
    </View>
  );
};
