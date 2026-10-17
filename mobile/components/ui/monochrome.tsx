import { type ReactNode } from "react";
import { View } from "react-native";

type MonochromeProps = { children: ReactNode; className?: string };

/**
 * Shows its content in black and white. A grey layer in `saturation` blend
 * takes the colour out; React Native's `filter: grayscale` is Android only.
 */
export const Monochrome = ({ children, className = "" }: MonochromeProps) => (
  <View className={className} style={{ isolation: "isolate" }}>
    {children}
    <View pointerEvents="none" className="absolute inset-0 bg-edge" style={{ mixBlendMode: "saturation" }} />
  </View>
);
