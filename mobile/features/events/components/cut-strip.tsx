import { AppIcon } from "@/components/ui/app-icon";
import { FilmStrip, type StripFrame } from "@/components/ui/film-strip";
import { colorTokens } from "@/theme/tokens";
import { Scissors } from "phosphor-react-native";
import { View } from "react-native";
import Svg, { Line } from "react-native-svg";

type CutStripProps = {
  /** Four frames: the two left of the cut as they are, the two right of it dimmed. */
  frames: StripFrame[];
};

// The dashed cut, as tall as the strip plus room above and below it.
const CUT_HEIGHT = 210;

/**
 * A strip of the roll, tilted on the table, with a dashed line where the
 * scissors go through it. Decorative: the screen says in words what a cut does.
 */
export const CutStrip = ({ frames }: CutStripProps) => (
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-71.5">
    <View className="absolute -left-2.5 -right-2.5 top-16.5 -rotate-3">
      <FilmStrip frames={frames} />
    </View>
    <View className="absolute left-1/2 top-9 -rotate-3">
      <Svg width={2} height={CUT_HEIGHT}>
        <Line
          x1={1}
          y1={0}
          x2={1}
          y2={CUT_HEIGHT}
          stroke={colorTokens.text}
          strokeOpacity={0.6}
          strokeWidth={2}
          strokeDasharray="6 6"
        />
      </Svg>
    </View>
    <View className="absolute left-1/2 top-3 -ml-3.5 -rotate-93">
      <AppIcon icon={Scissors} size="sm" color={colorTokens.text} />
    </View>
  </View>
);
