import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { MenuAction } from "@/components/ui/menu-action";
import { Monochrome } from "@/components/ui/monochrome";
import { Flag, Image, Prohibit, UserMinus, Users } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { firstName } from "../lib/roll-page";
import type { EventParticipantResponseDto } from "../types";

type PersonMenuProps = {
  person: EventParticipantResponseDto;
  /** Their role in edge print: "Adds photos". */
  roleLabel: string;
  /** A closed or suspended roll has no frames to count, so its people show none rather than 0. */
  showFrames?: boolean;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  /** Opens only their frames; omitted on a roll with no frames to show. */
  onSeeFrames?: () => void;
  /** Hosts only (11.3). */
  onChangeRole?: () => void;
  /** Hosts only (11.4). */
  onRemove?: () => void;
};

/** A person on the roll call: see their frames, report or block them, and for hosts change their role or remove them. */
export const PersonMenu = ({
  person,
  roleLabel,
  showFrames = true,
  onReport,
  onBlock,
  onUnblock,
  onSeeFrames,
  onChangeRole,
  onRemove,
}: PersonMenuProps) => {
  const { t } = useTranslation(["report", "roll"]);
  const name = person.name || t("roll:people.unknown");
  const facts = [
    person.username ? `@${person.username}` : null,
    roleLabel,
    showFrames ? t("person.frames", { count: person.photoCount }) : null,
  ].filter(Boolean);
  return (
    <View testID="person-menu">
      <View className="flex-row items-center gap-3 pb-4">
        <Monochrome className="size-[52px] overflow-hidden rounded-frame">
          <Avatar userId={person.userId} name={person.name} uri={person.avatarUrl} size="fill" />
        </Monochrome>
        <View className="flex-1 gap-1">
          <Text accessibilityRole="header" className="font-display text-title-sheet text-text" numberOfLines={1}>
            {name}
          </Text>
          <EdgePrint size="frame-label" numberOfLines={1}>
            {facts.join(" · ")}
          </EdgePrint>
        </View>
      </View>
      {onChangeRole ? <MenuAction label={t("menu.changeRole")} icon={Users} onPress={onChangeRole} /> : null}
      {onSeeFrames ? <MenuAction label={t("menu.seeFrames")} icon={Image} onPress={onSeeFrames} /> : null}
      <MenuAction label={t("menu.reportPerson", { name: firstName(name) })} icon={Flag} onPress={onReport} />
      {person.isBlockedByCaller ? (
        <MenuAction label={t("menu.unblock", { name: firstName(name) })} icon={Prohibit} onPress={onUnblock} />
      ) : (
        <MenuAction muted label={t("menu.block", { name: firstName(name) })} icon={Prohibit} onPress={onBlock} />
      )}
      {onRemove ? <MenuAction label={t("menu.remove")} icon={UserMinus} onPress={onRemove} /> : null}
    </View>
  );
};
