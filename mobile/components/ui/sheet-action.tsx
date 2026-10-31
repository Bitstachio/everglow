import { colorTokens } from "@/theme/tokens";
import type { ComponentProps } from "react";
import { Pressable } from "react-native";
import { AppIcon } from "./app-icon";
import { EdgePrint } from "./edge-print";

type SheetActionProps = {
  label: string;
  icon: ComponentProps<typeof AppIcon>["icon"];
  onPress: () => void;
  disabled?: boolean;
};

/** One action in a bottom-sheet menu. */
export const SheetAction = ({ label, icon, onPress, disabled = false }: SheetActionProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    className={[
      "min-h-12 flex-row items-center justify-between gap-4 border-b border-line py-4 active:opacity-60",
      disabled ? "opacity-50" : "",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    <EdgePrint tone="text" numberOfLines={1} className="flex-1">
      {label}
    </EdgePrint>
    <AppIcon icon={icon} size="sm" color={colorTokens.text} />
  </Pressable>
);
