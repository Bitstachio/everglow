import { Button } from "@/components/ui/button";
import { FilmGrain } from "@/components/ui/film-grain";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { OnboardingField } from "../components/onboarding-field";
import { OnboardingStepBar } from "../components/onboarding-step-bar";
import { SignatureFrame } from "../components/signature-frame";
import { useOnboardingNameScreen } from "../hooks/use-onboarding-name-screen";

/**
 * 02.1–02.2 Your name: the name your frames are signed with, shown on a
 * sample frame as you type.
 */
const OnboardingNameScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const { name, setName, hasTyped, signature, canContinue, onNext } = useOnboardingNameScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <OnboardingStepBar label={t("step", { step: 1, total: 3 })} backLabel={t("common:actions.back")} />

      <View className="px-5 pt-6">
        <OnboardingField
          label={t("name.label")}
          size="name"
          placeholder={t("name.placeholder")}
          accessibilityLabel={t("name.placeholder")}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={onNext}
          maxLength={255}
        />
      </View>

      <View className="mt-8 items-center">
        <SignatureFrame
          number={t("name.frameNumber")}
          signature={signature}
          accessibilityLabel={t("name.frameA11y", { name: signature })}
        />
        {hasTyped ? (
          <PencilNote accessibilityElementsHidden importantForAccessibility="no" className="mt-4 -rotate-3">
            {t("name.note")}
          </PencilNote>
        ) : null}
      </View>

      <View className="mt-auto px-5 pb-1">
        <Button title={t("next")} mark="▸" onPress={onNext} disabled={!canContinue} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default OnboardingNameScreen;
