import { useColorScheme as useRNColorScheme } from "react-native";

/** Narrow RN's ColorSchemeName (`unspecified` in SDK 55+) to theme keys. */
export const useColorScheme = (): "light" | "dark" => {
  return useRNColorScheme() === "dark" ? "dark" : "light";
};
