import { EdgePrint } from "@/components/ui/edge-print";
import { AppIcon } from "@/components/ui/app-icon";
import { colorTokens } from "@/theme/tokens";
import { WarningCircle } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import type { FooterAction } from "./roll-footer";

type RollTrayLineProps = {
  /** "Developing 1 of 5", "1 didn’t take · offline". */
  text: string;
  /** Opens the tray for progress or recovery controls. */
  action: FooterAction;
  needsAttention?: boolean;
};

/**
 * One line of edge print over the shutter while photos are in the tray
 * (08.2, 08.4): how they're doing, and the one thing to do about it.
 */
export const RollTrayLine = ({ text, action, needsAttention = false }: RollTrayLineProps) => (
  <View className="mx-5 min-h-11 flex-row items-center justify-between rounded-frame border border-outline-soft bg-sheet pl-3.5">
    <EdgePrint accessibilityLiveRegion="polite" tone="text" numberOfLines={1} className="flex-1">
      {text}
    </EdgePrint>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      hitSlop={8}
      className="min-h-11 flex-row items-center justify-center gap-1.5 px-3.5 active:opacity-60"
    >
      {needsAttention ? (
        <AppIcon
          icon={WarningCircle}
          size="sm"
          color={colorTokens.text}
          testID="tray-needs-attention"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <EdgePrint tone="text">{action.title}</EdgePrint>
    </Pressable>
  </View>
);
