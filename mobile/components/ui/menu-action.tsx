import { cn } from "@/lib/cn";
import { colorTokens } from "@/theme/tokens";
import type { ComponentProps } from "react";
import { Pressable, Text } from "react-native";
import { AppIcon } from "./app-icon";

type MenuActionProps = {
  label: string;
  icon: ComponentProps<typeof AppIcon>["icon"];
  onPress: () => void;
  /** A way out, such as Block or Leave the roll: the label dims. */
  muted?: boolean;
  /** The first row of a menu with no header above it: no rule on top. */
  first?: boolean;
};

/** One action in a menu sheet: its label in tracked mono caps, its icon on the right, ruled above. */
export const MenuAction = ({ label, icon, onPress, muted = false, first = false }: MenuActionProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    className={cn(
      "min-h-12 flex-row items-center justify-between gap-4 border-t border-line py-4 active:opacity-60",
      first && "border-t-0",
    )}
  >
    <Text
      numberOfLines={1}
      className={cn("flex-1 font-mono-semibold uppercase text-text-button", muted ? "text-edge" : "text-text")}
    >
      {label}
    </Text>
    <AppIcon icon={icon} size="sm" color={muted ? colorTokens.edge : colorTokens.text} />
  </Pressable>
);
