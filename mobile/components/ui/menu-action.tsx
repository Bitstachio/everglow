import { colorTokens } from "@/theme/tokens";
import type { ComponentProps } from "react";
import { Pressable } from "react-native";
import { AppIcon } from "./app-icon";
import { EdgePrint } from "./edge-print";

type MenuActionProps = {
  label: string;
  icon: ComponentProps<typeof AppIcon>["icon"];
  onPress: () => void;
  /** A way out, such as Block: the label dims. */
  muted?: boolean;
};

/** One action in a menu sheet: its label in edge print, its icon on the right, ruled above. */
export const MenuAction = ({ label, icon, onPress, muted = false }: MenuActionProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    className="min-h-12 flex-row items-center justify-between gap-4 border-t border-line py-4 active:opacity-60"
  >
    <EdgePrint tone={muted ? "edge" : "text"} className="flex-1">
      {label}
    </EdgePrint>
    <AppIcon icon={icon} size="sm" color={muted ? colorTokens.edge : colorTokens.text} />
  </Pressable>
);
