import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import { useTranslation } from "react-i18next";

type LastHostSlipProps = {
  onChooseHost: () => void;
  onCancel: () => void;
};

/** 11.6 Every roll keeps a host: the only one can't step down or leave until someone else is made host. */
export const LastHostSlip = ({ onChooseHost, onCancel }: LastHostSlipProps) => {
  const { t } = useTranslation("roll");
  return (
    <Slip edge={t("lastHost.edge")} title={t("lastHost.title")} body={t("lastHost.body")}>
      <Button title={t("lastHost.choose")} mark="▸" onPress={onChooseHost} />
      <Button title={t("lastHost.cancel")} variant="secondary" mark="‹" onPress={onCancel} />
    </Slip>
  );
};
