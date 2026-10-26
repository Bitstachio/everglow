import splashWordmark from "@/assets/images/splash-wordmark.png";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Image, View } from "react-native";

// The native splash's own picture and size (the expo-splash-screen plugin in
// app.json: imageWidth 220, 660x400 at 3x), centred the same way, so the
// hand-off from the native splash to this screen changes no pixel. Points,
// not spacing classes, so the size is exactly the native one.
const SPLASH_WIDTH = 220;
const SPLASH_HEIGHT = (SPLASH_WIDTH * 400) / 660;

const hideNativeSplash = () => void SplashScreen.hideAsync();

/**
 * 01.1 Launch: the name alone on black while the session is checked. It draws
 * the native splash's image rather than live text, because rendered text and
 * the image never match exactly. No grain here: the native splash can't carry
 * it. The native splash is hidden once the image has drawn (see
 * app/_layout.tsx), never before, so there's no blank frame in between.
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
      <Image
        testID="launch-wordmark"
        source={splashWordmark}
        style={{ width: SPLASH_WIDTH, height: SPLASH_HEIGHT }}
        onLoad={hideNativeSplash}
        // Never leave the native splash up, even if the image can't draw.
        onError={hideNativeSplash}
      />
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
