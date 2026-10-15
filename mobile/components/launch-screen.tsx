import { EdgePrint } from "@/components/ui/edge-print";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Text, View } from "react-native";

/**
 * 01.1 Launch: the name alone on grainy black while the session is checked.
 * The native splash (assets/images/splash-wordmark.png) is this screen's
 * wordmark and edge print, captured at the same size and centre, so the
 * hand-off is invisible. No grain here: the native splash can't carry it.
 * Regenerate the splash image if this layout changes. The native splash is
 * hidden once this has laid out (see app/_layout.tsx), never before.
 */
export const LaunchScreen = () => {
  const { t } = useTranslation("start");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("launch.status")}
      accessibilityState={{ busy: true }}
      onLayout={() => void SplashScreen.hideAsync()}
      className="flex-1 items-center justify-center bg-ground"
    >
      <Text className="font-display text-title-launch text-text">Everglow</Text>
      <View className="absolute left-0 right-0 top-1/2 mt-12 items-center">
        <EdgePrint>{t("launch.status")}</EdgePrint>
      </View>
    </View>
  );
};

const CURTAIN_FADE_MS = 250;
// If the start route somehow never redirects, lift the curtain anyway.
const CURTAIN_TIMEOUT_MS = 1500;

/**
 * The launch screen kept over the app while the start route redirects to the
 * first real screen, then faded out. Without it the hand-off shows a moment
 * of empty ground before the first screen appears.
 */
export const LaunchCurtain = () => {
  const pathname = usePathname();
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [timedOut, setTimedOut] = useState(false);
  const [lifted, setLifted] = useState(false);
  const arrived = pathname !== "/" || timedOut;

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), CURTAIN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!arrived) return;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : CURTAIN_FADE_MS,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => finished && setLifted(true));
    return () => fade.stop();
  }, [arrived, opacity, reduceMotion]);

  if (lifted) return null;
  return (
    <Animated.View pointerEvents="none" className="absolute inset-0" style={{ opacity }}>
      <LaunchScreen />
    </Animated.View>
  );
};
