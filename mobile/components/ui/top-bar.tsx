import { AppIcon } from "@/components/ui/app-icon";
import { colorTokens } from "@/theme/tokens";
import { CaretLeft, X } from "phosphor-react-native";
import { type ReactNode } from "react";
import { View } from "react-native";
import { EdgePrint } from "./edge-print";
import { IconButton } from "./icon-button";

type ChromeTone = "ground" | "paper";

type TopBarProps = {
  /** Edge print in the middle: where you are, for example "You" or "Blocked · 2". */
  title?: string;
  /** Usually a `BackButton` or `CloseButton`. */
  left?: ReactNode;
  /** A ghost `Button` such as Edit or Save. */
  right?: ReactNode;
  /** `paper` when the bar sits on the envelope's paper. Default: ground. */
  tone?: ChromeTone;
};

const inkFor = (tone: ChromeTone) => (tone === "paper" ? colorTokens.paperInk : colorTokens.text);

/** A screen's top bar: back or cancel on the left, the place in edge print, an action on the right. */
export const TopBar = ({ title, left, right, tone = "ground" }: TopBarProps) => (
  <View className="h-14 flex-row items-center px-5">
    <View className="flex-1 flex-row justify-start">{left}</View>
    {title ? (
      <EdgePrint accessibilityRole="header" numberOfLines={1} tone={tone === "paper" ? "paper" : "edge"}>
        {title}
      </EdgePrint>
    ) : null}
    <View className="flex-1 flex-row justify-end">{right}</View>
  </View>
);

type ChromeButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
  /** Matches the surface under the top bar. Default: ground. */
  tone?: ChromeTone;
};

/** The round back button for a `TopBar`. */
export const BackButton = ({ accessibilityLabel, onPress, testID, tone = "ground" }: ChromeButtonProps) => (
  <IconButton testID={testID} accessibilityLabel={accessibilityLabel} onPress={onPress} tone={tone}>
    <CaretLeft size={18} weight="bold" color={inkFor(tone)} />
  </IconButton>
);

/** The round close (X) button for a `TopBar`. */
export const CloseButton = ({ accessibilityLabel, onPress, testID, tone = "ground" }: ChromeButtonProps) => (
  <IconButton testID={testID} accessibilityLabel={accessibilityLabel} onPress={onPress} tone={tone}>
    <AppIcon icon={X} size="sm" color={inkFor(tone)} />
  </IconButton>
);
