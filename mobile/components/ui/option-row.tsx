import { Pressable, Text, View, type PressableProps } from "react-native";

type OptionRowProps = Omit<PressableProps, "children"> & {
  title: string;
  /** What choosing this does. */
  description?: string;
  selected: boolean;
};

/**
 * One choice in a set: a role, or what happens to someone's photos. A round
 * mark, the choice, and what it means. Group rows in a `radiogroup` view.
 */
export const OptionRow = ({ title, description, selected, className = "", ...props }: OptionRowProps) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    accessibilityLabel={description ? `${title}. ${description}` : title}
    className={`min-h-12 flex-row items-start gap-3 border-t border-sprocket py-3.5 ${className}`.trim()}
    {...props}
  >
    <View className={`mt-0.5 size-4.5 rounded-full border-text ${selected ? "border-5" : "border-2"}`} />
    <View className="flex-1 gap-0.5">
      <Text className="font-sans-semibold text-name text-text">{title}</Text>
      {description ? <Text className="font-sans text-body text-text-2">{description}</Text> : null}
    </View>
  </Pressable>
);
