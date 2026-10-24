import { EdgePrint } from "@/components/ui/edge-print";
import { Pressable, View } from "react-native";
import type { FooterAction } from "./roll-footer";

type RollTrayLineProps = {
  /** "Developing 1 of 5", "1 didn’t take · offline". */
  text: string;
  /** "Tray ›" or "Retry ↻". */
  action: FooterAction;
};

/**
 * One line of edge print over the shutter while photos are in the tray
 * (08.2, 08.4): how they're doing, and the one thing to do about it.
 */
export const RollTrayLine = ({ text, action }: RollTrayLineProps) => (
  <View className="mx-5 min-h-11 flex-row items-center justify-between rounded-frame border border-outline-soft bg-sheet pl-3.5">
    <EdgePrint accessibilityLiveRegion="polite" tone="text" numberOfLines={1} className="flex-1">
      {text}
    </EdgePrint>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      hitSlop={8}
      className="min-h-11 justify-center px-3.5 active:opacity-60"
    >
      <EdgePrint tone="text">{action.title}</EdgePrint>
    </Pressable>
  </View>
);
