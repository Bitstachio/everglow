import { ThemedText } from "@/components/ui/themed-text";
import { Pressable } from "react-native";
import type { EventsListSortDirection } from "../utils";

type EventsListSortButtonProps = {
  direction: EventsListSortDirection;
  onPress: () => void;
};

const SORT_LABELS: Record<EventsListSortDirection, string> = {
  asc: "Date · Earliest",
  desc: "Date · Latest",
};

export const EventsListSortButton = ({ direction, onPress }: EventsListSortButtonProps) => {
  const label = SORT_LABELS[direction];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Toggles event date between earliest and latest"
      onPress={onPress}
      className="self-start rounded-xl border border-border bg-background px-4 py-2.5"
    >
      <ThemedText className="text-sm font-medium">{label}</ThemedText>
    </Pressable>
  );
};
