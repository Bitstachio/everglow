import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";

const subscribe = (onStoreChange: () => void) => {
  const subscription = Appearance.addChangeListener(onStoreChange);
  return () => subscription.remove();
};

const getSnapshot = (): "light" | "dark" => (Appearance.getColorScheme() === "dark" ? "dark" : "light");

/**
 * To support static rendering, the server snapshot is always light and the
 * client re-reads the system appearance after hydration.
 */
export const useColorScheme = (): "light" | "dark" => {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
};
