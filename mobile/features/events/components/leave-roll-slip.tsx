import { Button } from "@/components/ui/button";
import { OptionRow } from "@/components/ui/option-row";
import { Slip } from "@/components/ui/slip";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

type LeavePhotos = "KEEP" | "DELETE";

type LeaveRollSlipProps = {
  rollTitle: string;
  /** Frames this member added. The choice is skipped at 0, and on a closed roll the photos are already gone. */
  frameCount: number;
  closed: boolean;
  photos: LeavePhotos;
  error: string | null;
  isLeaving: boolean;
  onChoose: (photos: LeavePhotos) => void;
  onConfirm: () => void;
  onStay: () => void;
};

/** What happens to the frames you added, then leave or stay. */
export const LeaveRollSlip = ({
  rollTitle,
  frameCount,
  closed,
  photos,
  error,
  isLeaving,
  onChoose,
  onConfirm,
  onStay,
}: LeaveRollSlipProps) => {
  const { t } = useTranslation("roll");
  const asks = !closed && frameCount > 0;

  return (
    <Slip
      edge={asks ? t("leave.edge", { title: rollTitle }) : undefined}
      title={asks ? t("leave.framesTitle", { count: frameCount }) : t("leave.title", { title: rollTitle })}
      body={asks ? undefined : closed ? t("leave.bodyClosed") : t("leave.return")}
    >
      {asks ? (
        <View accessibilityRole="radiogroup">
          <OptionRow
            title={t("leave.keep")}
            description={t("leave.keepBody")}
            selected={photos === "KEEP"}
            disabled={isLeaving}
            onPress={() => onChoose("KEEP")}
          />
          <OptionRow
            title={t("leave.take")}
            description={t("leave.takeBody", { count: frameCount })}
            selected={photos === "DELETE"}
            disabled={isLeaving}
            onPress={() => onChoose("DELETE")}
          />
        </View>
      ) : null}
      {asks ? <Text className="mt-1 font-sans text-body text-text-2">{t("leave.return")}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
          {error}
        </Text>
      ) : null}
      <Button title={t("leave.confirm")} variant="danger" mark="⇥" onPress={onConfirm} isLoading={isLeaving} />
      <Button title={t("leave.cancel")} variant="secondary" mark="‹" onPress={onStay} disabled={isLeaving} />
    </Slip>
  );
};
