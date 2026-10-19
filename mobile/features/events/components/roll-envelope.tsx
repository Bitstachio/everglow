import { LabEnvelope } from "@/components/ui/lab-envelope";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

type RollEnvelopeProps = {
  /** The roll's name. */
  title: string;
  /** When the roll is, formatted: "Sat 7 Nov, 7 pm". */
  startsAt?: string;
  /** Everyone on the roll, hosts included. */
  peopleCount?: number;
  /** When the photos go, formatted: "14 Nov, then it’s gone". */
  pickUpBy?: string;
  /** Which box is ticked: the adds-photos or the view-only envelope. */
  admits?: "adds" | "view";
  /** Sealed until the guest signs in: nothing filled in, nothing ticked, no code (06.3). */
  sealed?: boolean;
  /** The QR code, at the bottom right. */
  code?: ReactNode;
  /** A `Stamp` over the bottom right corner. */
  stamp?: ReactNode;
  accessibilityLabel: string;
};

/**
 * A roll's envelope: the kit's `LabEnvelope` filled in with the roll. The
 * printed parts are the lab's; the caller formats what is written in by hand.
 */
export const RollEnvelope = ({
  title,
  startsAt,
  peopleCount,
  pickUpBy,
  admits,
  sealed = false,
  code,
  stamp,
  accessibilityLabel,
}: RollEnvelopeProps) => {
  const { t } = useTranslation("envelope");
  const filled = (value: string | undefined) => (sealed ? undefined : value);

  return (
    <View className={stamp ? "pb-4" : undefined}>
      <LabEnvelope
        title={t("paper.head")}
        fields={[
          { label: t("paper.name"), value: filled(title) },
          { label: t("paper.date"), value: filled(startsAt) },
          {
            label: t("paper.people"),
            value: filled(peopleCount === undefined ? undefined : t("paper.peopleCount", { count: peopleCount })),
          },
          { label: t("paper.pickUp"), value: filled(pickUpBy) },
        ]}
        options={[
          { label: t("paper.adds"), checked: !sealed && admits === "adds" },
          { label: t("paper.view"), checked: !sealed && admits === "view" },
        ]}
        footer={sealed ? t("paper.sealed") : admits === "view" ? t("paper.admitsView") : t("paper.scan")}
        code={sealed ? undefined : code}
        accessibilityLabel={accessibilityLabel}
      />
      {stamp ? <View className="absolute -bottom-2 right-4">{stamp}</View> : null}
    </View>
  );
};
