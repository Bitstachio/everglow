import { Pressable, Text, View, type PressableProps } from "react-native";
import { EdgePrint } from "./edge-print";

type FilmBoxProps = Omit<PressableProps, "children"> & {
  /** The gallery length in days: 3, 7, 14 or 30. */
  days: number;
  /** Edge print under the number, for example "day roll". */
  label: string;
  selected?: boolean;
  accessibilityLabel: string;
};

/**
 * Choosing how long a gallery stays open is picking a box of film. Four sit
 * in a row (`flex-1` each, `gap-2`); the chosen one is white.
 */
export const FilmBox = ({ days, label, selected = false, className = "", ...props }: FilmBoxProps) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    className={[
      "h-28 flex-1 justify-between overflow-hidden rounded-paper px-2.5 pb-2.5 pt-4",
      selected ? "bg-leader" : "border border-sprocket bg-frame-empty",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    <View className="absolute left-0 right-0 top-0 h-1.5 flex-row gap-1 overflow-hidden opacity-70">
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} className={`h-1.5 w-1.5 ${selected ? "bg-text-2" : "bg-sprocket"}`} />
      ))}
    </View>
    <Text className={`font-display text-title-screen ${selected ? "text-on-leader" : "text-text"}`}>{days}</Text>
    <EdgePrint size="frame-label" tone={selected ? "paper" : "edge"}>
      {label}
    </EdgePrint>
  </Pressable>
);
