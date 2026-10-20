import { colorTokens } from "@/theme/tokens";
import { LockSimple, Plus } from "phosphor-react-native";
import { Pressable, View, type PressableProps } from "react-native";
import { AppIcon } from "./app-icon";
import { EdgePrint } from "./edge-print";

type ShutterProps = Omit<PressableProps, "children"> & {
  accessibilityLabel: string;
  /** Edge print under the shutter, for example "Add photos". */
  label?: string;
  /** Adding photos isn't open yet, or is on hold: a lock, dimmed, and no press. */
  locked?: boolean;
};

/** Adding photos: a camera shutter, the one large round control. 78pt. */
export const Shutter = ({
  accessibilityLabel,
  label,
  locked = false,
  disabled = false,
  className = "",
  ...props
}: ShutterProps) => (
  <View className={`items-center gap-2 ${className}`.trim()}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: (disabled ?? false) || locked }}
      disabled={disabled || locked}
      className={[
        "size-19.5 items-center justify-center rounded-full border-4 border-text active:opacity-80",
        locked ? "opacity-30" : disabled ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <View className="size-15 items-center justify-center rounded-full bg-leader">
        <AppIcon icon={locked ? LockSimple : Plus} size="md" color={colorTokens.onLeader} />
      </View>
    </Pressable>
    {label ? <EdgePrint tone="text">{label}</EdgePrint> : null}
  </View>
);
