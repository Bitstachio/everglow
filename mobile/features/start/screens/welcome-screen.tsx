import birthday01 from "@/assets/images/welcome/birthday-01.jpg";
import birthday03 from "@/assets/images/welcome/birthday-03.jpg";
import birthday05 from "@/assets/images/welcome/birthday-05.jpg";
import nightout01 from "@/assets/images/welcome/nightout-01.jpg";
import nightout03 from "@/assets/images/welcome/nightout-03.jpg";
import trip02 from "@/assets/images/welcome/trip-02.jpg";
import trip03 from "@/assets/images/welcome/trip-03.jpg";
import wedding04 from "@/assets/images/welcome/wedding-04.jpg";
import wedding06 from "@/assets/images/welcome/wedding-06.jpg";
import wedding09 from "@/assets/images/welcome/wedding-09.jpg";
import wedding11 from "@/assets/images/welcome/wedding-11.jpg";
import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip } from "@/components/ui/film-strip";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useWelcomeScreen } from "../hooks/use-welcome-screen";

// Film edge numbering: decorative, the same in every language.
const EDGE_TOP = "Everglow 400   ▸ 12   12A   ▸ 13   13A   ▸ 14   14A   ▸ 15";
const EDGE_BOTTOM = "▸ 24   24A   ▸ 25   25A   Everglow 400   ▸ 26   26A";

/**
 * 01.2 Welcome: the contact sheet is the pitch. A night's photos as three
 * strips, one frame circled in pencil, and one action to start a roll.
 */
const WelcomeScreen = () => {
  const { t } = useTranslation("start");
  const { isLoading, onStart, onSignIn } = useWelcomeScreen();

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="h-14 flex-row items-center justify-between px-5">
        <Wordmark />
        <Button title={t("welcome.signIn")} variant="ghost" fullWidth={false} onPress={onSignIn} disabled={isLoading} />
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-1 justify-center gap-3"
      >
        <EdgePrint numberOfLines={1} ellipsizeMode="clip" className="px-5">
          {EDGE_TOP}
        </EdgePrint>
        <FilmStrip
          frames={[
            { key: "a", image: wedding09 },
            { key: "b", image: nightout03 },
            { key: "c", caption: t("welcome.caption") },
            { key: "d", image: birthday03 },
          ]}
        />
        <FilmStrip
          frames={[
            { key: "e", image: trip02 },
            { key: "f", image: wedding04 },
            { key: "g", image: birthday01 },
            { key: "h", image: nightout01 },
          ]}
        />
        <View>
          <FilmStrip
            frames={[
              { key: "i", image: wedding11 },
              { key: "j", image: birthday05, circled: true },
              { key: "k", image: trip03 },
              { key: "l", image: wedding06 },
            ]}
          />
          <PencilNote className="absolute -bottom-9 left-34 -rotate-3">{t("welcome.note")}</PencilNote>
        </View>
        <EdgePrint numberOfLines={1} ellipsizeMode="clip" className="px-5 pt-6">
          {EDGE_BOTTOM}
        </EdgePrint>
      </View>

      <View className="gap-4 px-5 pb-2 pt-4">
        <Display dim={t("welcome.titleDim")}>{t("welcome.title")}</Display>
        <Button title={t("welcome.start")} mark="▸" onPress={onStart} isLoading={isLoading} />
        <EdgePrint className="text-center">{t("welcome.free")}</EdgePrint>
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default WelcomeScreen;
