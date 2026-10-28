import { Monochrome } from "@/components/ui/monochrome";
import { Photo } from "@/components/ui/photo";
import { clampCropOffset, clampCropScale, coverScale, type CropTransform, type Size } from "@/lib/photo-crop";
import { colorTokens } from "@/theme/tokens";
import { useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

type PhotoCropperProps = {
  uri: string;
  photo: Size;
  /** The window the photo is framed in, in points. */
  window: Size;
  /** A round window, for the avatar's circle; otherwise a rectangle. */
  round?: boolean;
  /** Shows the photo in black and white, as the lab card prints it. */
  monochrome?: boolean;
  /**
   * What the photo covers at its smallest: the whole screen, or only the
   * window, so a wide photo can be framed whole in a wide window.
   */
  fill?: "screen" | "window";
  /** Called on layout and after each gesture: the area the photo covers, centred on the window, and where the photo sits. */
  onChange: (area: Size, transform: CropTransform) => void;
};

// The window sits a little above the middle, as drawn (02.8).
const WINDOW_CENTRE_Y = 0.44;

/** The area the photo has to cover: the window, or the screen extended so the window is its centre. */
const coverArea = (screen: Size, window: Size, fill: "screen" | "window"): Size => {
  if (fill === "window") return window;
  const y = screen.height * WINDOW_CENTRE_Y;
  return { width: screen.width, height: 2 * Math.max(y, screen.height - y) };
};

/**
 * The photo full screen under a dark mask with a window. Pinch to scale,
 * drag to move; the photo always covers the window.
 */
export const PhotoCropper = ({
  uri,
  photo,
  window,
  round = false,
  monochrome = false,
  fill = "screen",
  onChange,
}: PhotoCropperProps) => {
  const [screen, setScreen] = useState<Size | null>(null);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0 });

  const centre = screen ? { x: screen.width / 2, y: screen.height * WINDOW_CENTRE_Y } : { x: 0, y: 0 };
  const area = screen ? coverArea(screen, window, fill) : null;
  const fit = area ? coverScale(photo, area) : 1;
  const base = { width: photo.width * fit, height: photo.height * fit };
  const left = centre.x - window.width / 2;
  const top = centre.y - window.height / 2;

  const report = () => {
    if (area) onChange(area, { scale: scale.value, x: x.value, y: y.value });
  };

  const remember = () => {
    "worklet";
    start.value = { scale: scale.value, x: x.value, y: y.value };
  };
  const settle = () => {
    "worklet";
    scheduleOnRN(report);
  };

  const pinch = Gesture.Pinch()
    .onStart(remember)
    .onUpdate((event) => {
      scale.value = clampCropScale(start.value.scale * event.scale);
      x.value = clampCropOffset(x.value, base.width * scale.value, window.width);
      y.value = clampCropOffset(y.value, base.height * scale.value, window.height);
    })
    .onEnd(settle);

  const pan = Gesture.Pan()
    .onStart(remember)
    .onUpdate((event) => {
      x.value = clampCropOffset(start.value.x + event.translationX, base.width * scale.value, window.width);
      y.value = clampCropOffset(start.value.y + event.translationY, base.height * scale.value, window.height);
    })
    .onEnd(settle);

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  // The mask is the screen with the window cut out of it.
  const hole = round
    ? `M${left} ${centre.y}a${window.width / 2} ${window.height / 2} 0 1 0 ${window.width} 0a${window.width / 2} ${window.height / 2} 0 1 0 ${-window.width} 0Z`
    : `M${left} ${top}h${window.width}v${window.height}h${-window.width}Z`;

  return (
    <View
      className="absolute inset-0 overflow-hidden bg-viewer"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setScreen({ width, height });
        onChange(coverArea({ width, height }, window, fill), { scale: 1, x: 0, y: 0 });
      }}
    >
      {screen ? (
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
          <View className="absolute inset-0">
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: centre.x - base.width / 2,
                  top: centre.y - base.height / 2,
                  width: base.width,
                  height: base.height,
                },
                moved,
              ]}
            >
              {monochrome ? (
                <Monochrome className="h-full w-full">
                  <Photo source={{ uri }} contentFit="cover" className="h-full w-full" />
                </Monochrome>
              ) : (
                <Photo source={{ uri }} contentFit="cover" className="h-full w-full" />
              )}
            </Animated.View>
            <View pointerEvents="none" className="absolute inset-0">
              <Svg width={screen.width} height={screen.height}>
                <Path
                  fill={colorTokens.viewer}
                  fillOpacity={0.75}
                  fillRule="evenodd"
                  d={`M0 0H${screen.width}V${screen.height}H0Z ${hole}`}
                />
                {round ? (
                  <Ellipse
                    cx={centre.x}
                    cy={centre.y}
                    rx={window.width / 2}
                    ry={window.height / 2}
                    stroke={colorTokens.text}
                    strokeWidth={2}
                    fill="none"
                  />
                ) : (
                  <Rect
                    x={left}
                    y={top}
                    width={window.width}
                    height={window.height}
                    stroke={colorTokens.text}
                    strokeWidth={2}
                    fill="none"
                  />
                )}
              </Svg>
            </View>
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
};
