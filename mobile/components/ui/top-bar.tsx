import { colorTokens } from "@/theme/tokens";
import { CaretLeft } from "phosphor-react-native";
import { type ReactNode } from "react";
import { View } from "react-native";
import { EdgePrint } from "./edge-print";
import { IconButton } from "./icon-button";

type TopBarProps = {
  /** Edge print in the middle: where you are, for example "You" or "Blocked · 2". */
  title?: string;
  /** Usually a `BackButton` or a ghost `Button` such as Cancel. */
  left?: ReactNode;
  /** A ghost `Button` such as Edit or Save. */
  right?: ReactNode;
};

/** A screen's top bar: back or cancel on the left, the place in edge print, an action on the right. */
export const TopBar = ({ title, left, right }: TopBarProps) => (
  <View className="h-14 flex-row items-center px-5">
    <View className="flex-1 flex-row justify-start">{left}</View>
    {title ? (
      <EdgePrint accessibilityRole="header" numberOfLines={1}>
        {title}
      </EdgePrint>
    ) : null}
    <View className="flex-1 flex-row justify-end">{right}</View>
  </View>
);

/** The round back button for a `TopBar`. */
export const BackButton = ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) => (
  <IconButton accessibilityLabel={accessibilityLabel} onPress={onPress}>
    <CaretLeft size={18} weight="bold" color={colorTokens.text} />
  </IconButton>
);
