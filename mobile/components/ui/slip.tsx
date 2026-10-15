import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { EdgePrint } from "./edge-print";

type SlipProps = {
  /** Edge print above the title: what this is about, for example "Frame 144 · by Leila". */
  edge?: string;
  title: string;
  /** What happens, in plain words. */
  body?: string;
  /** Leaders, primary first. */
  children?: ReactNode;
};

/**
 * The content of a confirmation slip: edge print, a title, what will happen,
 * then the actions. Put it in a `BottomSheet` without a sheet title.
 */
export const Slip = ({ edge, title, body, children }: SlipProps) => (
  <View className="gap-2">
    {edge ? <EdgePrint>{edge}</EdgePrint> : null}
    <Text accessibilityRole="header" className="font-display text-title-slip text-text">
      {title}
    </Text>
    {body ? <Text className="font-sans text-body text-text-2">{body}</Text> : null}
    {children ? <View className="gap-2.5 pt-2.5">{children}</View> : null}
  </View>
);
