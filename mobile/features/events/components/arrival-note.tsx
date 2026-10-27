import { Text, View } from "react-native";

/**
 * The note on a roll just opened from an envelope (06.6, 06.7): which member
 * the guest is, or that they were already on it. A strip of white leader with
 * a tick, over the top of the roll.
 */
export const ArrivalNote = ({ label }: { label: string }) => (
  <View
    accessible
    accessibilityRole="alert"
    accessibilityLiveRegion="polite"
    className="h-13 flex-row items-center justify-between rounded-leader bg-leader px-4"
  >
    <Text className="flex-1 font-mono-semibold text-text-button uppercase text-on-leader">{label}</Text>
    <Text importantForAccessibility="no" accessibilityElementsHidden className="font-mono-semibold text-on-leader">
      ✓
    </Text>
  </View>
);
