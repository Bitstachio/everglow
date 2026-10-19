import { LabEnvelope } from "@/components/ui/lab-envelope";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

type RollEnvelopeProps = {
  /** The roll's name. */
  title: string;
  /** When it happens, formatted: "Sat 7 Nov, 7 pm". */
  startsAt?: string;
  /** Everyone on the roll, hosts included. */
  peopleCount?: number;
  /** When the photos go, formatted: "14 Nov". */
  pickUpBy?: string;
  /** Which box is ticked: adds photos, or view only. */
  admits?: "adds" | "view";
  /** A sealed envelope leaves the fields blank. */
  sealed?: boolean;
  /** The QR code, at the bottom right. */
  code?: ReactNode;
  /** A `Stamp` laid over the envelope's bottom right corner. */
  stamp?: ReactNode;
  accessibilityLabel: string;
};

/** A roll's envelope (04.6): the kit's `LabEnvelope` filled in with the roll. Presentational only. */
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
  const { t } = useTranslation("create");
  const filled = (value: string | undefined) => (sealed ? undefined : value);

  return (
    <View>
      <LabEnvelope
        title={t("envelope.lab")}
        fields={[
          { label: t("envelope.name"), value: filled(title) },
          { label: t("envelope.date"), value: filled(startsAt) },
          {
            label: t("envelope.onTheRoll"),
            value: filled(peopleCount === undefined ? undefined : t("envelope.people", { count: peopleCount })),
          },
          {
            label: t("envelope.pickUp"),
            value: filled(pickUpBy === undefined ? undefined : t("envelope.gone", { date: pickUpBy })),
          },
        ]}
        options={
          admits
            ? [
                { label: t("envelope.adds"), checked: admits === "adds" },
                { label: t("envelope.view"), checked: admits === "view" },
              ]
            : undefined
        }
        footer={code ? t("envelope.scan") : undefined}
        code={code}
        accessibilityLabel={accessibilityLabel}
      />
      {stamp ? <View className="absolute -bottom-2 right-4">{stamp}</View> : null}
    </View>
  );
};
