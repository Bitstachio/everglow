import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";

type DeleteRollSlipProps = {
  edge: string;
  body: string;
  confirmLabel: string;
  /** Why the API refused, such as open reports or a review; the slip stays so it can be read. */
  error: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onKeep: () => void;
};

/** Delete a closed roll for everyone: what goes, then Delete or Keep it. */
export const DeleteRollSlip = ({
  edge,
  body,
  confirmLabel,
  error,
  isDeleting,
  onConfirm,
  onKeep,
}: DeleteRollSlipProps) => {
  const { t } = useTranslation("roll");

  return (
    <Slip edge={edge} title={t("settings.deleteRoll.title")} body={body}>
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-body text-pencil">
          {error}
        </Text>
      ) : null}
      <Button
        testID="delete-roll-confirm"
        title={confirmLabel}
        variant="danger"
        mark="✕"
        onPress={onConfirm}
        isLoading={isDeleting}
      />
      <Button title={t("settings.deleteRoll.cancel")} variant="secondary" mark="‹" onPress={onKeep} />
    </Slip>
  );
};
