import { ThemedText } from "@/components/ui/themed-text";
import { Pressable } from "react-native";
import type { EventsListSortDirection } from "../utils";

type EventsListSortButtonProps = {
  direction: EventsListSortDirection;
  onPress: () => void;
};

const SORT_LABELS: Record<EventsListSortDirection, string> = {
  asc: "Oldest to newest",
  desc: "Newest to oldest",
};

export const EventsListSortButton = ({ direction, onPress }: EventsListSortButtonProps) => {
  const label = SORT_LABELS[direction];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Toggles between newest to oldest and oldest to newest"
      onPress={onPress}
      className="self-start rounded-xl border border-border bg-background px-4 py-2.5"
    >
      <ThemedText className="text-sm font-medium">{label}</ThemedText>
    </Pressable>
  );
};
