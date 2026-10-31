import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import type { SheetFrame } from "../../lib/roll-page";
import { FramePhoto } from "../frame-photo/frame-photo";
import { loadsOriginal, pageWindow } from "./paging";
import { useFramePageStyle, type useFramePager } from "./use-frame-pager";

type Pager = ReturnType<typeof useFramePager>;

const FramePage = ({
  frame,
  page,
  index,
  width,
  label,
  fadeMs,
  pager,
  onRetry,
}: {
  frame: SheetFrame;
  page: number;
  index: number;
  width: number;
  label: string;
  fadeMs: number;
  pager: Pager;
  onRetry: () => Promise<void>;
}) => {
  const active = page === index;
  const style = useFramePageStyle(pager.zoom, active);
  return (
    <Animated.View
      testID={`frame-page-${frame.photo.id}`}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[{ position: "absolute", top: 0, bottom: 0, left: page * pager.stride, width }, style]}
    >
      <FramePhoto
        frame={frame}
        label={label}
        active={active}
        original={loadsOriginal(page, index)}
        fadeMs={fadeMs}
        onRetry={onRetry}
      />
    </Animated.View>
  );
};

/**
 * The viewport the frames slide through. Only a window of frames around the
 * current one is mounted, each at its own place on the strip, so a long roll
 * costs the same as a short one and a neighbour keeps its image as it
 * becomes current.
 */
export const FramePager = ({
  frame,
  frames,
  index,
  width,
  label,
  fadeMs,
  pager,
  onRetry,
}: {
  frame: SheetFrame;
  frames: SheetFrame[];
  index: number;
  width: number;
  label: string;
  fadeMs: number;
  pager: Pager;
  onRetry: () => Promise<void>;
}) => {
  const { first, last } = pageWindow(index, frames.length);
  return (
    <GestureDetector gesture={pager.gesture}>
      <View testID="frame-viewer-pager" className="flex-1 overflow-hidden" onLayout={pager.onLayout}>
        <Animated.View style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, pager.stripStyle]}>
          {frames.slice(first, last + 1).map((item, offset) => (
            <FramePage
              key={item.photo.id}
              // The open frame may carry a renewed URL the list does not have yet.
              frame={first + offset === index ? frame : item}
              page={first + offset}
              index={index}
              width={width}
              label={label}
              fadeMs={fadeMs}
              pager={pager}
              onRetry={onRetry}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
};
