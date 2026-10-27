import { LabEnvelope } from "@/components/ui/lab-envelope";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  /** A button at the foot of the paper (the host's Share the link). */
  action?: ReactNode;
  /** A pencilled note under the boxes, with an arrow to the ticked one (the host's envelope). */
  note?: string;
  /** Makes the boxes tappable, to switch between the two envelopes (the host's envelope). */
  onSelect?: (admits: "adds" | "view") => void;
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
  const filled = (value: string | undefined) => (sealed ? undefined : value);

  return (
    <LabEnvelope
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
        {
          label: t("paper.adds"),
          checked: !sealed && admits === "adds",
          onPress: onSelect && !sealed ? () => onSelect("adds") : undefined,
        },
        {
          label: t("paper.view"),
          checked: !sealed && admits === "view",
          onPress: onSelect && !sealed ? () => onSelect("view") : undefined,
        },
      ]}
      // Only the sealed envelope needs a word by the code: it has none.
      footer={sealed ? t("paper.sealed") : undefined}
      code={sealed ? undefined : code}
      note={sealed ? undefined : note}
      action={sealed ? undefined : action}
      stamp={stamp}
      dimmed={dimmed}
      accessibilityLabel={accessibilityLabel}
    />
  );
};
