import { EdgePrint } from "@/components/ui/edge-print";
import { Pressable, Text, View } from "react-native";

type WhenFieldProps = {
  heading: string;
  /** "Tonight · 20:00". */
  when: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
};

/** 04.3 When the roll happens, under its label; tapping it opens the calendar slip. */
export const WhenField = ({ heading, when, accessibilityLabel, disabled = false, onPress }: WhenFieldProps) => (
  <View>
    <EdgePrint className="mb-2.5">{heading}</EdgePrint>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center justify-between rounded-paper border border-sprocket bg-frame-empty px-4 active:opacity-80"
      // In points, so it lines up with the film boxes below as they render (EV-165).
      style={{ height: 56 }}
    >
      <Text className="font-display text-title-slip text-text">{when}</Text>
      <Text className="font-mono-semibold text-text-button text-text">›</Text>
    </Pressable>
  </View>
);
