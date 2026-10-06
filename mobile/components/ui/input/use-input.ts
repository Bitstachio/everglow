import i18n from "@/i18n/instance";
import { useState } from "react";

type UseInputParams = {
  secureTextEntry?: boolean;
  editable?: boolean;
};

export const useInput = ({ secureTextEntry = false, editable = true }: UseInputParams) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const showToggle = secureTextEntry;

  return {
    showToggle,
    isDisabled: editable === false,
    isSecure: secureTextEntry && !isPasswordVisible,
    toggleAccessibilityLabel: isPasswordVisible
      ? i18n.t("a11y.hidePassword", { ns: "common" })
      : i18n.t("a11y.showPassword", { ns: "common" }),
    toggleIconName: isPasswordVisible ? ("eye-off-outline" as const) : ("eye-outline" as const),
    onTogglePasswordVisibility: () => setIsPasswordVisible((visible) => !visible),
  };
};
