import { Avatar } from "@/components/ui/avatar";
import { EdgePrint } from "@/components/ui/edge-print";
import { MenuAction } from "@/components/ui/menu-action";
import { Monochrome } from "@/components/ui/monochrome";
import { Flag, Prohibit, UserMinus } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { EventParticipantResponseDto } from "../types";

type PersonMenuProps = {
  person: EventParticipantResponseDto;
  /** Their role in edge print: "Adds photos". */
  roleLabel: string;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  /** Hosts only, for someone who isn't a host. */
  onRemove?: () => void;
};

/** 11.2 / 11.8 A person on the roll call: report them, block or unblock them, and for hosts remove them. */
export const PersonMenu = ({ person, roleLabel, onReport, onBlock, onUnblock, onRemove }: PersonMenuProps) => {
  const { t } = useTranslation(["report", "roll"]);
  const name = person.name || t("roll:people.unknown");
  const firstName = name.trim().split(/\s+/)[0] || name;
  const frames = t("person.frames", { count: person.photoCount });
  return (
    <View testID="person-menu">
      <View className="flex-row items-center gap-3 pb-4">
        <Monochrome className="size-12 overflow-hidden rounded-frame">
          <Avatar userId={person.userId} name={person.name} uri={person.avatarUrl} size="fill" />
        </Monochrome>
        <View className="flex-1 gap-1">
          <Text accessibilityRole="header" className="font-sans-medium text-name text-text" numberOfLines={1}>
            {name}
          </Text>
          <EdgePrint size="frame-label" numberOfLines={1}>
            {person.username
              ? t("person.edge", { role: roleLabel, username: person.username, frames })
              : t("person.edgeNoUsername", { role: roleLabel, frames })}
          </EdgePrint>
        </View>
      </View>
      <MenuAction label={t("menu.reportPerson", { name: firstName })} icon={Flag} onPress={onReport} />
      {person.isBlockedByCaller ? (
        <MenuAction label={t("menu.unblock", { name: firstName })} icon={Prohibit} onPress={onUnblock} />
      ) : (
        <MenuAction muted label={t("menu.block", { name: firstName })} icon={Prohibit} onPress={onBlock} />
      )}
      {onRemove ? (
        <MenuAction label={t("menu.remove", { name: firstName })} icon={UserMinus} onPress={onRemove} />
      ) : null}
    </View>
  );
};
