import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";

type BlockSlipProps = {
  /** Their full name, as the roll call shows it. */
  name: string;
  busy: boolean;
  /** Why the last attempt failed, so Block can be tried again. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 10.11 Block someone. Silent and both ways; hosts still see you in their own
 * rolls. Put it in a `BottomSheet`.
 */
export const BlockSlip = ({ name, busy, error, onConfirm, onCancel }: BlockSlipProps) => {
  const { t } = useTranslation("report");
  const firstName = name.trim().split(/\s+/)[0] || name;
  return (
    <Slip edge={t("block.edge", { name })} title={t("block.title")} body={t("block.body", { name: firstName })}>
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
          {error}
        </Text>
      ) : null}
      <Button
        title={t("block.confirm", { name: firstName })}
        variant="danger"
        mark="⦸"
        isLoading={busy}
        onPress={onConfirm}
      />
      <Button title={t("block.cancel")} variant="secondary" mark="‹" disabled={busy} onPress={onCancel} />
    </Slip>
  );
};
