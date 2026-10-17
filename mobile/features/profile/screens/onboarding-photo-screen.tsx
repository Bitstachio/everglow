import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { LabCard } from "@/components/ui/lab-card";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { OnboardingStepBar } from "../components/onboarding-step-bar";
import { useOnboardingPhotoScreen } from "../hooks/use-onboarding-photo-screen";

/**
 * 02.7 Your photo: the lab card filled in from the last two steps, waiting
 * for a face. Optional; Skip goes straight to the finished card.
 */
const OnboardingPhotoScreen = () => {
  const { t } = useTranslation(["onboarding", "common"]);
  const { card, takePhoto, chooseFromLibrary, skip } = useOnboardingPhotoScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <OnboardingStepBar
        label={t("step", { step: 3, total: 3 })}
        backLabel={t("common:actions.back")}
        action={
          <View>
            <Button title={t("photo.skip")} variant="ghost" fullWidth={false} onPress={skip} />
          </View>
        }
      />

      <View className="px-5.5 pt-2">
        <LabCard {...card} />
      </View>

      <View className="px-5 pt-14">
        <Display dim={t("photo.titleDim")}>{t("photo.title")}</Display>
        <Text className="mt-3 font-sans text-body text-text-2">{t("photo.body")}</Text>
      </View>

      <View className="mt-auto gap-3 px-5 pb-1">
        <Button title={t("photo.take")} mark="+" onPress={takePhoto} />
        <Button title={t("photo.choose")} mark="▸" variant="outline" onPress={chooseFromLibrary} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default OnboardingPhotoScreen;
