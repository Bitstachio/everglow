import grain from "@/assets/images/film-grain.png";
import { Image, View } from "react-native";

/**
 * Film grain over a screen's ground: a tiled noise texture at 14%, screened
 * so it only lightens. Place it last inside a full-screen container; it takes
 * no touches and is hidden from assistive tech.
 */
export const FilmGrain = () => (
  <View
    pointerEvents="none"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    className="absolute inset-0"
  >
    <Image source={grain} resizeMode="repeat" className="h-full w-full opacity-14 mix-blend-screen" />
  </View>
);
