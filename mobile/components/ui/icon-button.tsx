import { type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

type IconButtonProps = Omit<PressableProps, "children"> & {
  accessibilityLabel: string;
  children: ReactNode;
};

/** 36px visual control with hitSlop so the tap target meets 44pt+. */
export const IconButton = ({
  accessibilityLabel,
  children,
  disabled = false,
  className = "",
  hitSlop = 8,
  ...props
}: IconButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    hitSlop={hitSlop}
    className={["h-9 w-9 items-center justify-center rounded-full active:bg-surface", disabled ? "opacity-50" : "", className]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </Pressable>
);
