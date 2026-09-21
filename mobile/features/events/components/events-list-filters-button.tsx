import { ThemedText } from "@/components/ui/themed-text";
import { Pressable } from "react-native";

type EventsListFiltersButtonProps = {
  onPress: () => void;
  active?: boolean;
};

export const EventsListFiltersButton = ({ onPress, active = false }: EventsListFiltersButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Filters"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    className={`self-start rounded-xl border px-4 py-2.5 ${active ? "border-strong bg-surface" : "border-border bg-background"}`}
  >
    <ThemedText className="text-sm font-medium">{active ? "Filters · On" : "Filters"}</ThemedText>
  </Pressable>
);
