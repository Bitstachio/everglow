import { cn } from "@/lib/cn";
import { type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

type IconButtonTone = "ground" | "paper";

type IconButtonProps = Omit<PressableProps, "children"> & {
  accessibilityLabel: string;
  children: ReactNode;
  /** Surface the button sits on. `paper` for the envelope. Default: ground. */
  tone?: IconButtonTone;
};

const TONE_CLASSES: Record<IconButtonTone, string> = {
  // Soft white ring and dark sheet flash on the contact-sheet ground.
  ground: "border-outline-soft active:bg-sheet",
  // Paper-ink hairline and a slightly deeper paper flash on the envelope.
  paper: "border-paper-rule active:bg-paper-flap",
};

/**
 * A 40pt round outline button for top bars. With hitSlop the tap target
 * meets 44pt+. The only round controls are this and the shutter.
 */
export const IconButton = ({
  accessibilityLabel,
  children,
  disabled = false,
  tone = "ground",
  className = "",
  hitSlop = 8,
  ...props
}: IconButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled}
    hitSlop={hitSlop}
    className={cn(
      "size-10 items-center justify-center rounded-full border",
      TONE_CLASSES[tone],
      disabled && "opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </Pressable>
);
