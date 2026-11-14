import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { GreasePencil } from "@/components/ui/grease-pencil";
import { Monochrome } from "@/components/ui/monochrome";
import { RollCallRow } from "@/components/ui/roll-call-row";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { AccessLevel, EventParticipantResponseDto } from "../types";

type RollPeopleListProps = {
  participants: EventParticipantResponseDto[];
  currentUserId?: string;
  /** Opens someone else's actions: report, block, and for hosts role and removal (11.2, 11.8). */
  onPerson: (participant: EventParticipantResponseDto) => void;
};

export const ROLE_KEY = {
  ORGANIZER: "people.host",
  PARTICIPANT: "people.addsPhotos",
  VIEWER: "people.viewOnly",
} as const satisfies Record<AccessLevel, string>;

/** Hosts first, then everyone else in the order the API lists them. */
export const rollCallOrder = (participants: EventParticipantResponseDto[]) => [
  ...participants.filter((participant) => participant.accessLevel === "ORGANIZER"),
  ...participants.filter((participant) => participant.accessLevel !== "ORGANIZER"),
];

/** 11.1 / 11.7 Everyone on the roll, numbered, with their role in edge print. Hosts are starred in pencil. */
export const RollPeopleList = ({ participants, currentUserId, onPerson }: RollPeopleListProps) => {
  const { t } = useTranslation("roll");

  return (
    <View testID="roll-people">
      {rollCallOrder(participants).map((participant, index) => {
        const isYou = participant.userId === currentUserId;
        const name = participant.name || t("people.unknown");
        const role = t(ROLE_KEY[participant.accessLevel]);
        return (
          <RollCallRow
            key={participant.userId}
            number={index + 1}
            // Portraits print in black and white on the roll call, as drawn.
            avatar={
              <Monochrome className="overflow-hidden rounded-frame">
                <Avatar userId={participant.userId} name={participant.name} uri={participant.avatarUrl} />
              </Monochrome>
            }
            name={name}
            accessibilityLabel={`${isYou ? t("people.youLabel", { name }) : name}, ${role}`}
            mark={
              <>
                {participant.accessLevel === "ORGANIZER" ? (
                  <GreasePencil mark="star" width={20} height={19} strokeWidth={2.2} />
                ) : null}
                {isYou ? <EdgePrint>{t("people.youMark")}</EdgePrint> : null}
              </>
            }
            roleLabel={role}
            disabled={isYou}
            onPress={isYou ? undefined : () => onPerson(participant)}
          />
        );
      })}
    </View>
  );
};
