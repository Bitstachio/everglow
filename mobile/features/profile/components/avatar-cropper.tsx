import { Monochrome } from "@/components/ui/monochrome";
import { Photo } from "@/components/ui/photo";
import { colorTokens } from "@/theme/tokens";
import { useState } from "react";
import { View, type LayoutRectangle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { clampCropOffset, clampCropScale, coverScale, type CropTransform, type Size } from "../lib/avatar-crop";

type AvatarCropperProps = {
  uri: string;
  photo: Size;
  /** The circle's radius in points. */
  radius: number;
  /** Called on layout and after each gesture: the area the photo covers, centred on the circle, and where the photo sits. */
  onChange: (area: Size, transform: CropTransform) => void;
};

// The circle sits a little above the middle, as drawn (02.8).
const CIRCLE_CENTRE_Y = 0.44;

/**
 * The photo full screen under a dark mask with a round window. Pinch to
 * scale, drag to move; the photo always covers the window.
 */
export const AvatarCropper = ({ uri, photo, radius, onChange }: AvatarCropperProps) => {
  const [screen, setScreen] = useState<Pick<LayoutRectangle, "width" | "height"> | null>(null);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0 });

  const centre = screen ? { x: screen.width / 2, y: screen.height * CIRCLE_CENTRE_Y } : { x: 0, y: 0 };
  // The photo is centred on the circle, which sits above the middle, so it
  // has to reach the further screen edge on both sides of it.
  const area = screen ? { width: screen.width, height: 2 * Math.max(centre.y, screen.height - centre.y) } : null;
  const fit = area ? coverScale(photo, area) : 1;
  const base = { width: photo.width * fit, height: photo.height * fit };

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
      x.value = clampCropOffset(x.value, base.width * scale.value, radius);
      y.value = clampCropOffset(y.value, base.height * scale.value, radius);
    })
    .onEnd(settle);

  const pan = Gesture.Pan()
    .onStart(remember)
    .onUpdate((event) => {
      x.value = clampCropOffset(start.value.x + event.translationX, base.width * scale.value, radius);
      y.value = clampCropOffset(start.value.y + event.translationY, base.height * scale.value, radius);
    })
    .onEnd(settle);

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <View
      className="absolute inset-0 overflow-hidden bg-viewer"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setScreen({ width, height });
        const y = height * CIRCLE_CENTRE_Y;
        onChange({ width, height: 2 * Math.max(y, height - y) }, { scale: 1, x: 0, y: 0 });
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
              <Monochrome className="h-full w-full">
                <Photo source={{ uri }} contentFit="cover" className="h-full w-full" />
              </Monochrome>
            </Animated.View>
            <View pointerEvents="none" className="absolute inset-0">
              <Svg width={screen.width} height={screen.height}>
                <Path
                  fill={colorTokens.viewer}
                  fillOpacity={0.75}
                  fillRule="evenodd"
                  d={`M0 0H${screen.width}V${screen.height}H0Z M${centre.x - radius} ${centre.y}a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0Z`}
                />
                <Circle cx={centre.x} cy={centre.y} r={radius} stroke={colorTokens.text} strokeWidth={2} fill="none" />
              </Svg>
            </View>
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
};
