import { useFocusEffect } from "expo-router";
import { BackHandler } from "react-native";

/** Swallows Android's system back until the returned cleanup runs. */
export const blockHardwareBack = () => {
  const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
  return () => subscription.remove();
};

/**
 * Android's system back (button or gesture) does nothing while this screen is
 * focused. `gestureEnabled: false` only stops the iOS swipe; Android still pops
 * the stack. Use it on screens that must not go back to steps already done.
 */
export const useBlockHardwareBack = () => useFocusEffect(blockHardwareBack);
