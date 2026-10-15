import { colorTokens } from "@/theme/tokens";
import { Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { EdgePrint } from "./edge-print";

type FrameCounterProps = {
  /** Photos on the roll so far. */
  count: number;
  /** Edge print under the dial, for example "Frames on the roll". */
  label?: string;
  /** Spoken in full: "148 frames on the roll". */
  accessibilityLabel: string;
};

const DIAL = 230;
const TICKS = Array.from({ length: 30 }, (_, i) => (i * 360) / 30);

/**
 * The gallery opening, drawn as a camera's frame counter: a dial with a white
 * window that shows the count. It climbs as people add photos.
 */
export const FrameCounter = ({ count, label, accessibilityLabel }: FrameCounterProps) => (
  <View accessible accessibilityLabel={accessibilityLabel} className="items-center gap-4">
    <View className="size-57.5 items-center justify-center rounded-full border-2 border-sprocket bg-sheet">
      <View className="absolute inset-0 items-center justify-center">
        <Svg width={DIAL} height={DIAL}>
          {TICKS.map((angle) => {
            const radians = (angle * Math.PI) / 180;
            const [outer, inner] = [DIAL / 2 - 14, DIAL / 2 - 24];
            return (
              <Line
                key={angle}
                x1={DIAL / 2 + outer * Math.sin(radians)}
                y1={DIAL / 2 - outer * Math.cos(radians)}
                x2={DIAL / 2 + inner * Math.sin(radians)}
                y2={DIAL / 2 - inner * Math.cos(radians)}
                stroke={colorTokens.edge}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
      </View>
      <View className="h-21 w-30 items-center justify-center rounded-lg bg-leader">
        <Text className="font-mono-semibold text-counter text-on-leader">{String(count).padStart(2, "0")}</Text>
      </View>
    </View>
    {label ? <EdgePrint>{label}</EdgePrint> : null}
  </View>
);
