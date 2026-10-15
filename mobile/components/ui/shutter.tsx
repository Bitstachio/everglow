import { colorTokens } from "@/theme/tokens";
import { Plus } from "phosphor-react-native";
import { Pressable, View, type PressableProps } from "react-native";
import { AppIcon } from "./app-icon";
import { EdgePrint } from "./edge-print";

type ShutterProps = Omit<PressableProps, "children"> & {
  accessibilityLabel: string;
  /** Edge print under the shutter, for example "Add photos". */
  label?: string;
};

/** Adding photos: a camera shutter, the one large round control. 78pt. */
export const Shutter = ({ accessibilityLabel, label, disabled = false, className = "", ...props }: ShutterProps) => (
  <View className={`items-center gap-2 ${className}`.trim()}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled ?? false }}
      disabled={disabled}
      className={[
        "size-19.5 items-center justify-center rounded-full border-4 border-text active:opacity-80",
        disabled ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <View className="size-15 items-center justify-center rounded-full bg-leader">
        <AppIcon icon={Plus} size="md" color={colorTokens.dark.onLeader} />
      </View>
    </Pressable>
    {label ? <EdgePrint tone="text">{label}</EdgePrint> : null}
  </View>
);
