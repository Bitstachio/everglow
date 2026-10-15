import { View } from "react-native";
import { EdgePrint } from "./edge-print";
import { Photo } from "./photo";

export type StripFrame = {
  key: string;
  /** Photo URL. Omit for an unexposed (blank) frame. */
  uri?: string;
  /** A blank frame's number, printed in its corner. */
  number?: number;
  /** Darken the frame, for photos that are past or out of reach. */
  dim?: boolean;
};

type FilmStripProps = {
  frames: StripFrame[];
  className?: string;
};

// Enough holes to cross the widest phone; the row clips the rest.
const HOLES = Array.from({ length: 48 }, (_, i) => i);

const Sprockets = () => (
  <View className="h-1.5 flex-row gap-2 overflow-hidden px-1">
    {HOLES.map((hole) => (
      <View key={hole} className="h-1.5 w-2 rounded-xs bg-sprocket" />
    ))}
  </View>
);

/**
 * A strip of film: sprocket holes along both edges and a row of frames on the
 * film base. Home shows each event as one. The frames are previews, so the
 * strip is hidden from assistive tech; label the row that contains it.
 */
export const FilmStrip = ({ frames, className = "" }: FilmStripProps) => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    className={`gap-2 bg-rebate py-1 ${className}`.trim()}
  >
    <Sprockets />
    <View className="flex-row gap-1 px-1">
      {frames.map((frame) => (
        <View key={frame.key} className="aspect-11/9 flex-1 overflow-hidden rounded-frame bg-frame-empty">
          {frame.uri ? (
            <Photo
              source={{ uri: frame.uri }}
              contentFit="cover"
              className={`h-full w-full ${frame.dim ? "opacity-35" : ""}`.trim()}
            />
          ) : frame.number !== undefined ? (
            <EdgePrint size="frame-label" className="absolute bottom-1 left-1.5">
              {String(frame.number).padStart(2, "0")}
            </EdgePrint>
          ) : null}
        </View>
      ))}
    </View>
    <Sprockets />
  </View>
);
