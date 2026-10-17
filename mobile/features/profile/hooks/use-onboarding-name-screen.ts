import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingDraft } from "../onboarding-draft";

/** The API takes any non-empty name; two characters keeps a stray tap from signing every frame. */
export const ONBOARDING_NAME_MIN_LENGTH = 2;

/**
 * 02.1–02.2 Your name. The sample frame is signed as you type; Next (or the
 * keyboard's next key) goes on to the username.
 */
export const useOnboardingNameScreen = () => {
  const { t } = useTranslation("onboarding");
  const { name, setName } = useOnboardingDraft();
  const signature = name.trim();
  const canContinue = signature.length >= ONBOARDING_NAME_MIN_LENGTH;

  return {
    name,
    setName,
    hasTyped: signature.length > 0,
    signature: signature || t("name.frameUnsigned"),
    canContinue,
    onNext: () => {
      if (canContinue) router.push("/onboarding/username");
    },
  };
};
