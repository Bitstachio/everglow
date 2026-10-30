import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { RollCallRow } from "@/components/ui/roll-call-row";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import type { AccessLevel, EventParticipantResponseDto } from "../types";

type RollPeopleListProps = {
  participants: EventParticipantResponseDto[];
  currentUserId?: string;
  /** Hosts can take someone off the roll; others only look. */
  onRemove?: (participant: EventParticipantResponseDto) => void;
};

const ROLE_KEY = {
  ORGANIZER: "people.host",
  PARTICIPANT: "people.addsPhotos",
  VIEWER: "people.viewOnly",
} as const satisfies Record<AccessLevel, string>;

/** Who's on the roll, for the sheet over the roll: hosts first, then everyone else as they appear. */
export const RollPeopleList = ({ participants, currentUserId, onRemove }: RollPeopleListProps) => {
  const { t } = useTranslation("roll");
  const ordered = [
    ...participants.filter((participant) => participant.accessLevel === "ORGANIZER"),
    ...participants.filter((participant) => participant.accessLevel !== "ORGANIZER"),
  ];

  return (
    <View testID="roll-people" className="gap-4">
      <EdgePrint accessibilityRole="header">{t("people.edge", { count: participants.length })}</EdgePrint>
      <ScrollView className="max-h-96">
        {ordered.map((participant, index) => {
          const isYou = participant.userId === currentUserId;
          const name = participant.name || t("people.unknown");
          const removable = Boolean(onRemove) && !isYou && participant.accessLevel !== "ORGANIZER";
          return (
            <RollCallRow
              key={participant.userId}
              number={index + 1}
              avatar={<Avatar userId={participant.userId} name={participant.name} uri={participant.avatarUrl} />}
              name={isYou ? t("people.you", { name }) : name}
              roleLabel={t(ROLE_KEY[participant.accessLevel])}
              disabled={!removable}
              onPress={removable ? () => onRemove?.(participant) : undefined}
            />
          );
        })}
      </ScrollView>
    </View>
  );
};
