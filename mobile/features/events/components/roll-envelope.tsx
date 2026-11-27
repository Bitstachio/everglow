import { LabEnvelope, LabEnvelopeBack } from "@/components/ui/lab-envelope";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type RollEnvelopeProps = {
  /** The roll's name. */
  title: string;
  /** When the roll is, formatted: "Sat, 7 Nov, 19:00". */
  startsAt?: string;
  /** Everyone on the roll, organizers included. */
  peopleCount?: number;
  /** When the gallery ends, formatted: "Sat, 14 Nov, 19:00". */
  pickUpBy?: string;
  /** Which box is ticked: the participant or the viewer envelope. */
  admits?: "participant" | "viewer";
  /** Sealed until the invitee signs in: its back, with the flap shut and nothing written on it (06.3). */
  sealed?: boolean;
  /** The QR code, at the bottom right. */
  code?: ReactNode;
  /** A button at the foot of the paper (the organizer's Share the link). */
  action?: ReactNode;
  /** A pencilled note under the boxes, with an arrow to the ticked one (the organizer's envelope). */
  note?: string;
  /** Makes the boxes tappable, to switch between the two envelopes (the organizer's envelope). */
  onSelect?: (admits: "participant" | "viewer") => void;
  /** A `Stamp` on the paper's bottom right corner. */
  stamp?: ReactNode;
  /** A returned envelope: the paper dims, its stamp doesn't. */
  dimmed?: boolean;
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
  note,
  action,
  onSelect,
  stamp,
  dimmed,
  accessibilityLabel,
}: RollEnvelopeProps) => {
  const { t } = useTranslation("envelope");

  if (sealed) return <LabEnvelopeBack stamp={stamp} accessibilityLabel={accessibilityLabel} />;

  return (
    <LabEnvelope
      fields={[
        { label: t("paper.name"), value: title },
        { label: t("paper.date"), value: startsAt },
        {
          label: t("paper.people"),
          value: peopleCount === undefined ? undefined : t("paper.peopleCount", { count: peopleCount }),
        },
        { label: t("paper.pickUp"), value: pickUpBy },
      ]}
      options={[
        {
          label: t("paper.participant"),
          checked: admits === "participant",
          onPress: onSelect ? () => onSelect("participant") : undefined,
        },
        {
          label: t("paper.viewer"),
          checked: admits === "viewer",
          onPress: onSelect ? () => onSelect("viewer") : undefined,
        },
      ]}
      code={code}
      note={note}
      action={action}
      stamp={stamp}
      dimmed={dimmed}
      accessibilityLabel={accessibilityLabel}
    />
  );
};
