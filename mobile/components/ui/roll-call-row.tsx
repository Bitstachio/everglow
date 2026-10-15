import { type ReactNode } from "react";
import { Pressable, Text, View, type PressableProps } from "react-native";
import { EdgePrint } from "./edge-print";

type RollCallRowProps = Omit<PressableProps, "children"> & {
  /** Position on the roll call, 1-based. */
  number: number;
  /** The person's photo, usually an `Avatar`. */
  avatar: ReactNode;
  name: string;
  /** Edge print on the right: the role ("Host", "Adds photos", "View only"). */
  roleLabel?: string;
  /** A removed person: greyed, for the removed list. */
  gone?: boolean;
};

/** One person on the roll call: number, photo, name, role. */
export const RollCallRow = ({
  number,
  avatar,
  name,
  roleLabel,
  gone = false,
  className = "",
  ...props
}: RollCallRowProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={roleLabel ? `${name}, ${roleLabel}` : name}
    className={`min-h-14 flex-row items-center gap-3 border-b border-line py-2.5 active:bg-sheet ${className}`.trim()}
    {...props}
  >
    <EdgePrint className="w-6">{String(number).padStart(2, "0")}</EdgePrint>
    <View className={gone ? "opacity-35" : ""}>{avatar}</View>
    <Text className={`flex-1 font-sans-medium text-name ${gone ? "text-edge" : "text-text"}`} numberOfLines={1}>
      {name}
    </Text>
    {roleLabel ? <EdgePrint>{roleLabel}</EdgePrint> : null}
  </Pressable>
);
