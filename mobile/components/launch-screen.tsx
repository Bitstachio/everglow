import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

/**
 * 01.1 Launch: the name alone on grainy black while the session is checked.
 * The native splash (assets/images/splash-wordmark.png) is this screen's
 * wordmark and edge print, captured at the same size and centre, so the
 * hand-off only adds the grain. Regenerate it if this layout changes.
 */
export const LaunchScreen = () => {
  const { t } = useTranslation("start");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("launch.status")}
      accessibilityState={{ busy: true }}
      className="flex-1 items-center justify-center bg-ground"
    >
      <Text className="font-display text-title-launch text-text">Everglow</Text>
      <View className="absolute left-0 right-0 top-1/2 mt-12 items-center">
        <EdgePrint>{t("launch.status")}</EdgePrint>
      </View>
      <FilmGrain />
    </View>
  );
};
