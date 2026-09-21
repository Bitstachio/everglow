import { AppIcon } from "@/components/ui/app-icon";
import { ThemedText } from "@/components/ui/themed-text";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { EventsListSortDirection } from "../utils";

type EventsListSortButtonProps = {
  direction: EventsListSortDirection;
  onPress: () => void;
};

export const EventsListSortButton = ({ direction, onPress }: EventsListSortButtonProps) => {
  const ascending = direction === "asc";
  const Icon = ascending ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  const directionLabel = ascending ? "ascending" : "descending";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by date ${directionLabel}`}
      accessibilityHint="Toggles ascending and descending"
      onPress={onPress}
      className="self-start rounded-xl border border-border bg-background px-4 py-2.5"
    >
      <View className="flex-row items-center gap-2">
        <AppIcon icon={Icon} size="sm" color="#64748B" />
        <ThemedText className="text-sm font-medium">Date</ThemedText>
      </View>
    </Pressable>
  );
};
