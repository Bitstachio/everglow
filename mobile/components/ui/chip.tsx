import { ThemedText } from "@/components/ui/themed-text";
import { type ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";

type ChipVariant = "outline" | "soft";

type ChipProps = Omit<PressableProps, "children"> & {
  label: string;
  selected?: boolean;
  /** Leading affordance (icon). */
  icon?: ReactNode;
  /**
   * outline — bordered toolbar chips (filters, sort).
   * soft — filled selectable chips (filter roles).
   */
  variant?: ChipVariant;
};

const VARIANT_CLASSES: Record<ChipVariant, { idle: string; selected: string }> = {
  outline: {
    idle: "border border-border bg-background",
    selected: "border border-strong bg-surface",
  },
  soft: {
    idle: "bg-surface",
    selected: "bg-border",
  },
};

export const Chip = ({
  label,
  selected = false,
  icon,
  variant = "outline",
  disabled = false,
  className = "",
  accessibilityLabel,
  accessibilityHint,
  ...props
}: ChipProps) => {
  const surface = selected ? VARIANT_CLASSES[variant].selected : VARIANT_CLASSES[variant].idle;
  const labelTone = selected ? "foreground" : variant === "soft" ? "muted" : "foreground";
  const labelWeight = selected && variant === "soft" ? "font-semibold" : "font-medium";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={4}
      className={[
        "h-11 flex-row items-center justify-center gap-2 rounded-xl",
        variant === "soft" ? "px-3" : "px-4",
        surface,
        disabled ? "opacity-50" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {icon ? <View className="items-center justify-center">{icon}</View> : null}
      <ThemedText className={`text-sm ${labelWeight}`} tone={labelTone}>
        {label}
      </ThemedText>
    </Pressable>
  );
};
