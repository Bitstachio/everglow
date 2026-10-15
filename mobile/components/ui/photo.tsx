import { Image } from "expo-image";
import { styled } from "nativewind";

/**
 * `expo-image` with `className` mapped to `style`. NativeWind adapts core
 * React Native views itself, but not this third-party view; without the
 * adapter, size classes are ignored and the image doesn't show.
 */
export const Photo = styled(Image, { className: "style" });
