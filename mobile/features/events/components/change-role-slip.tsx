import { Button } from "@/components/ui/button";
import { OptionRow } from "@/components/ui/option-row";
import { Slip } from "@/components/ui/slip";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { firstName } from "../lib/roll-page";
import type { AccessLevel } from "../types";
import { ROLE_KEY } from "./roll-people-list";

type ChangeRoleSlipProps = {
  name: string;
  /** Their role now: the choice the slip opens on. */
  current: AccessLevel;
  busy?: boolean;
  /** Why the last try didn't go through. */
  error?: string | null;
  onSave: (accessLevel: AccessLevel) => void;
};

const ROLES = [
  { level: "ORGANIZER", body: "role.hostBody" },
  { level: "PARTICIPANT", body: "role.addsPhotosBody" },
  { level: "VIEWER", body: "role.viewOnlyBody" },
] as const satisfies readonly { level: AccessLevel; body: string }[];

/**
 * 11.3 Change someone's role: three roles, each with what it can do. Making
 * someone a host asks first, since a host can do everything you can. As
 * drawn there's only Save; the sheet closes like any other.
 */
export const ChangeRoleSlip = ({ name, current, busy = false, error, onSave }: ChangeRoleSlipProps) => {
  const { t } = useTranslation("roll");
  const [selected, setSelected] = useState<AccessLevel>(current);
  const [confirming, setConfirming] = useState(false);
  const first = firstName(name);

  const alert = error ? (
    <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
      {error}
    </Text>
  ) : null;

  if (confirming) {
    return (
      <Slip edge={name} title={t("role.confirmTitle", { name: first })} body={t("role.confirmBody")}>
        {alert}
        <Button
          title={t("role.confirm", { name: first })}
          mark="✓"
          isLoading={busy}
          onPress={() => onSave("ORGANIZER")}
        />
        <Button
          title={t("role.back")}
          variant="secondary"
          mark="‹"
          disabled={busy}
          onPress={() => setConfirming(false)}
        />
      </Slip>
    );
  }

  const promoting = selected === "ORGANIZER" && current !== "ORGANIZER";
  return (
    <Slip edge={name} title={t("role.title")}>
      <View accessibilityRole="radiogroup" className="mb-2.5">
        {ROLES.map(({ level, body }) => (
          <OptionRow
            key={level}
            title={t(ROLE_KEY[level])}
            description={t(body)}
            selected={selected === level}
            disabled={busy}
            onPress={() => setSelected(level)}
          />
        ))}
      </View>
      {alert}
      <Button
        title={t("role.save")}
        mark={promoting ? "▸" : "✓"}
        isLoading={busy}
        onPress={() => (promoting ? setConfirming(true) : onSave(selected))}
      />
    </Slip>
  );
};
