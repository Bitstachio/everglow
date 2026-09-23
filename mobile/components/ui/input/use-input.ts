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
    toggleAccessibilityLabel: isPasswordVisible ? "Hide password" : "Show password",
    toggleIconName: isPasswordVisible ? ("eye-off-outline" as const) : ("eye-outline" as const),
    onTogglePasswordVisibility: () => setIsPasswordVisible((visible) => !visible),
  };
};
