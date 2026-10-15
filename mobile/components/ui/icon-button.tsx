import { type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

type IconButtonProps = Omit<PressableProps, "children"> & {
  accessibilityLabel: string;
  children: ReactNode;
};

/**
 * A 40pt round outline button for top bars. With hitSlop the tap target
 * meets 44pt+. The only round controls are this and the shutter.
 */
export const IconButton = ({
  accessibilityLabel,
  children,
  disabled = false,
  className = "",
  hitSlop = 8,
  ...props
}: IconButtonProps) => {
  const isDisabled = disabled ?? false;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={hitSlop}
      className={[
        "size-10 items-center justify-center rounded-full border border-outline-soft active:bg-sheet",
        isDisabled ? "opacity-50" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </Pressable>
  );
};
