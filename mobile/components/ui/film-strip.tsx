import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { EdgePrint } from "./edge-print";
import { GreasePencil } from "./grease-pencil";
import { Photo } from "./photo";

export type StripFrame = {
  key: string;
  /** Photo URL. */
  uri?: string;
  /** A bundled photo (`import photo from "@/assets/…jpg"`). */
  image?: number;
  /** A frame that carries a short line of text instead of a photo. */
  caption?: string;
  /** A blank frame's number, printed in its corner. */
  number?: number;
  /** Darken the frame, for photos that are past or out of reach. */
  dim?: boolean;
  /** Circle the frame in pencil. */
  circled?: boolean;
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

const Frame = ({ frame, seed }: { frame: StripFrame; seed: number }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.round(width), height: Math.round(height) });
  };
  const source = frame.uri ? { uri: frame.uri } : frame.image;

  return (
    <View onLayout={frame.circled ? onLayout : undefined} className="aspect-11/9 flex-1">
      <View className="h-full w-full items-center justify-center overflow-hidden rounded-frame bg-frame-empty">
        {source !== undefined ? (
          <Photo
            source={source}
            contentFit="cover"
            className={`h-full w-full ${frame.dim ? "opacity-35" : ""}`.trim()}
          />
        ) : frame.caption ? (
          <Text adjustsFontSizeToFit numberOfLines={4} className="px-2 text-center font-display text-body text-text">
            {frame.caption}
          </Text>
        ) : frame.number !== undefined ? (
          <EdgePrint size="frame-label" className="absolute bottom-1 left-1.5">
            {String(frame.number).padStart(2, "0")}
          </EdgePrint>
        ) : null}
      </View>
      {frame.circled && size.width > 0 ? (
        <View className="absolute -left-2 -top-2">
          <GreasePencil mark="ring" width={size.width + 16} height={size.height + 16} seed={seed} drawOn />
        </View>
      ) : null}
    </View>
  );
};

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
      {frames.map((frame, index) => (
        <Frame key={frame.key} frame={frame} seed={index + 1} />
      ))}
    </View>
    <Sprockets />
  </View>
);
