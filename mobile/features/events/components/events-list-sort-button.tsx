import { Chip } from "@/components/ui/chip";
import type { EventsListSortDirection } from "../utils";

type EventsListSortButtonProps = {
  direction: EventsListSortDirection;
  onPress: () => void;
};

const SORT_LABELS: Record<EventsListSortDirection, string> = {
  asc: "Date · Earliest",
  desc: "Date · Latest",
};

export const EventsListSortButton = ({ direction, onPress }: EventsListSortButtonProps) => (
  <Chip
    label={SORT_LABELS[direction]}
    onPress={onPress}
    accessibilityHint="Toggles event date between earliest and latest"
    className="self-start"
  />
);
