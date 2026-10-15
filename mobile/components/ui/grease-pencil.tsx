import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { colorTokens } from "@/theme/tokens";
import { useEffect, useState } from "react";
import { Animated } from "react-native";
import Svg, { Path } from "react-native-svg";

import { pencilStrokes, type PencilMark } from "./grease-pencil-paths";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type GreasePencilProps = {
  mark: PencilMark;
  width: number;
  height: number;
  /** Pencil on the ground; ink-blue on paper. Default: pencil. */
  tone?: "pencil" | "ink";
  strokeWidth?: number;
  /** Varies the hand-drawn wobble between marks on one screen. */
  seed?: number;
  /** Draw the mark on (250 ms). Reduce Motion shows it already drawn. */
  drawOn?: boolean;
};

const DRAW_MS = 250;

const Stroke = ({
  d,
  length,
  color,
  strokeWidth,
  animate,
  delay,
}: {
  d: string;
  length: number;
  color: string;
  strokeWidth: number;
  animate: boolean;
  delay: number;
}) => {
  const [offset] = useState(() => new Animated.Value(animate ? length : 0));

  useEffect(() => {
    if (!animate) {
      offset.setValue(0);
      return;
    }
    const animation = Animated.timing(offset, { toValue: 0, duration: DRAW_MS, delay, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [animate, delay, offset]);

  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={[length, length]}
      strokeDashoffset={offset}
    />
  );
};

/**
 * A grease-pencil mark: ring, tick, cross, underline or strike. Strawberry
 * only ever appears this way. Marks are decorative: whatever they point at is
 * also said in text, so they are hidden from assistive tech.
 */
export const GreasePencil = ({
  mark,
  width,
  height,
  tone = "pencil",
  strokeWidth = 3,
  seed = 1,
  drawOn = false,
}: GreasePencilProps) => {
  const reduceMotion = useReduceMotion();
  const color = tone === "pencil" ? colorTokens.dark.pencil : colorTokens.dark.inkBlue;
  const strokes = pencilStrokes(mark, width, height, strokeWidth, seed);

  return (
    <Svg
      width={width}
      height={height}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {strokes.map((stroke, index) => (
        <Stroke
          key={index}
          d={stroke.d}
          length={stroke.length}
          color={color}
          strokeWidth={strokeWidth}
          animate={drawOn && !reduceMotion}
          delay={index * 120}
        />
      ))}
    </Svg>
  );
};
