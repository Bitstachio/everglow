import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { LabCard } from "@/components/ui/lab-card";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Stamp } from "@/components/ui/stamp";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useOnboardingReadyScreen } from "../hooks/use-onboarding-ready-screen";

/** 02.9 Lab card ready: the finished card, stamped READY, and the way to Home. */
const OnboardingReadyScreen = () => {
  const { t } = useTranslation("onboarding");
  const { card, firstName, onGo } = useOnboardingReadyScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="px-5.5 pt-16">
        <LabCard {...card} />
        <Stamp title={t("ready.stamp")} subtitle={t("ready.stampSub")} className="absolute -bottom-17 right-12" />
      </View>

      <View className="px-5 pt-16">
        <Display dim={`${firstName}.`}>{t("ready.title")}</Display>
        <Text className="mt-3 font-sans text-body text-text-2">{t("ready.body")}</Text>
      </View>

      <View className="mt-auto px-5 pb-1">
        <Button title={t("ready.go")} mark="▸" onPress={onGo} />
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default OnboardingReadyScreen;
