import { LabEnvelope } from "@/components/ui/lab-envelope";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

type RollEnvelopeProps = {
  /** The roll's name. */
  title: string;
  /** When it happens, as printed: "Sun 18 Oct, 4 pm". */
  startsAt?: string;
  /** People on the roll so far. */
  peopleCount?: number;
  /** The pick-up line, as printed: "17 Nov, then it’s gone". */
  pickUpBy?: string;
  /** What the envelope admits; leave it out when nobody knows yet. */
  admits?: "adds" | "view";
  /** Sealed before sign-in (06.3): no details, nothing ticked. */
  sealed?: boolean;
  /** The QR code at the bottom right. */
  code?: ReactNode;
  /** A `Stamp`, positioned by the caller with an absolute wrapper. */
  stamp?: ReactNode;
  accessibilityLabel: string;
};

/**
 * A roll's envelope (chapters 05 and 06): the lab's paper envelope with the
 * roll's details filled in by hand. Values the caller doesn't have print as
 * dashes, the way a returned envelope that doesn't open reads (06.9).
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
  const { t } = useTranslation("join");
  const unknown = t("envelope.unknown");
  const filled = (value: string | undefined) => (sealed ? undefined : value || unknown);

  const footer = sealed
    ? t("envelope.footerSealed")
    : admits === "view"
      ? t("envelope.footerView")
      : t("envelope.footerScan");

  return (
    <View>
      <LabEnvelope
        title={t("envelope.lab")}
        number={t("envelope.number")}
        fields={[
          { label: t("envelope.name"), value: filled(title) },
          { label: t("envelope.date"), value: filled(startsAt) },
          {
            label: t("envelope.onTheRoll"),
            value: filled(peopleCount === undefined ? undefined : t("envelope.people", { count: peopleCount })),
          },
          { label: t("envelope.pickUpBy"), value: filled(pickUpBy) },
        ]}
        options={[
          { label: t("envelope.adds"), checked: !sealed && admits === "adds" },
          { label: t("envelope.view"), checked: !sealed && admits === "view" },
        ]}
        footer={footer}
        code={sealed ? undefined : code}
        accessibilityLabel={accessibilityLabel}
      />
      {stamp}
    </View>
  );
};
