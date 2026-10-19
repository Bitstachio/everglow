import { Pressable, Text, View } from "react-native";

type EnvelopeSwitchOption<K extends string> = { key: K; label: string };

type EnvelopeSwitchProps<K extends string> = {
  options: EnvelopeSwitchOption<K>[];
  selected: K;
  onSelect: (key: K) => void;
};

/** Two halves in edge print; the chosen one is lit white. Switches which envelope is on the table (05.1–05.2). */
export const EnvelopeSwitch = <K extends string>({ options, selected, onSelect }: EnvelopeSwitchProps<K>) => (
  <View accessibilityRole="tablist" className="flex-row overflow-hidden rounded-paper border border-outline-soft">
    {options.map((option) => {
      const isSelected = option.key === selected;
      return (
        <Pressable
          key={option.key}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: isSelected }}
          onPress={() => onSelect(option.key)}
          className={`flex-1 items-center py-2.75 ${isSelected ? "bg-leader" : "active:bg-sheet"}`}
        >
          <Text
            className={`font-mono text-edge-print uppercase ${isSelected ? "text-on-leader" : "text-edge"}`}
            numberOfLines={1}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);
