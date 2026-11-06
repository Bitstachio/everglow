import { Button } from "@/components/ui/button";
import { OptionRow } from "@/components/ui/option-row";
import { Slip } from "@/components/ui/slip";
import type { MemberPhotos } from "@/lib/api/generated";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

type RemovePersonSlipProps = {
  name: string;
  /** Their frames on the roll, as the roll call counts them. */
  frameCount: number;
  /** Removing them settles a report on one of their frames, which goes either way (10.9). */
  reportedFrame?: boolean;
  busy?: boolean;
  onConfirm: (photos: MemberPhotos) => void;
  onCancel: () => void;
};

/**
 * 11.4 Remove someone from the roll: what happens to their frames, then the
 * removal. The roll call and a report decision (10.9) both confirm here.
 */
export const RemovePersonSlip = ({
  name,
  frameCount,
  reportedFrame = false,
  busy = false,
  onConfirm,
  onCancel,
}: RemovePersonSlipProps) => {
  const { t } = useTranslation("roll");
  const [photos, setPhotos] = useState<MemberPhotos>("KEEP");
  const firstName = name.split(" ")[0];
  const others = Math.max(frameCount - (reportedFrame ? 1 : 0), 0);

  return (
    <Slip
      edge={t("remove.edge", { name })}
      title={
        others === 0
          ? t("remove.title", { name: firstName })
          : reportedFrame
            ? t("remove.otherFrames", { count: others })
            : t("remove.frames", { count: others })
      }
      body={
        others === 0
          ? reportedFrame
            ? t("remove.bodyReported")
            : t("remove.body")
          : reportedFrame
            ? t("remove.reported")
            : undefined
      }
    >
      {others > 0 ? (
        <View accessibilityRole="radiogroup" className="mb-2.5">
          <OptionRow
            title={t("remove.keep")}
            description={t("remove.keepBody", { name: firstName })}
            selected={photos === "KEEP"}
            onPress={() => setPhotos("KEEP")}
            disabled={busy}
          />
          <OptionRow
            title={t("remove.delete")}
            description={t("remove.deleteBody", { count: others })}
            selected={photos === "DELETE"}
            onPress={() => setPhotos("DELETE")}
            disabled={busy}
          />
        </View>
      ) : null}
      <Button
        title={t("remove.confirm", { name: firstName })}
        variant="danger"
        mark="✕"
        isLoading={busy}
        onPress={() => onConfirm(photos)}
      />
      <Button title={t("remove.cancel")} variant="secondary" mark="‹" disabled={busy} onPress={onCancel} />
    </Slip>
  );
};
