import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions } from "react-native";

const SHEET_SLIDE_DISTANCE = Dimensions.get("window").height * 0.4;
const OPEN_DURATION_MS = { scrim: 200, sheet: 280 };
const CLOSE_DURATION_MS = { scrim: 200, sheet: 250 };

export const useBottomSheetPresentation = (visible: boolean) => {
  const [presented, setPresented] = useState(visible);
  const presentedRef = useRef(visible);
  const visibleRef = useRef(visible);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const scrimOpacity = useMemo(() => new Animated.Value(0), []);
  const sheetTranslateY = useMemo(() => new Animated.Value(SHEET_SLIDE_DISTANCE), []);

  if (visible && !presented) {
    setPresented(true);
  }

  useEffect(() => {
    visibleRef.current = visible;
    animation.current?.stop();

    if (visible) {
      presentedRef.current = true;
      scrimOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_SLIDE_DISTANCE);
      animation.current = Animated.parallel([
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: OPEN_DURATION_MS.scrim,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: OPEN_DURATION_MS.sheet,
          useNativeDriver: true,
        }),
      ]);
      animation.current.start();
      return () => animation.current?.stop();
    }

    if (!presentedRef.current) return;

    animation.current = Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: CLOSE_DURATION_MS.scrim,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SHEET_SLIDE_DISTANCE,
        duration: CLOSE_DURATION_MS.sheet,
        useNativeDriver: true,
      }),
    ]);
    animation.current.start(({ finished }) => {
      if (!finished || visibleRef.current) return;
      presentedRef.current = false;
      setPresented(false);
    });

    return () => animation.current?.stop();
  }, [visible, scrimOpacity, sheetTranslateY]);

  return {
    presented,
    scrimOpacity,
    sheetTranslateY,
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
  };
};
