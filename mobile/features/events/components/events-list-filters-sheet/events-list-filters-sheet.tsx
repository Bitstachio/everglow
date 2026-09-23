import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ThemedText } from "@/components/ui/themed-text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { AccessLevel } from "../../types";
import { displayFilterDay, EVENT_ROLE_OPTIONS, type EventsListFilters } from "../../utils";
import { useEventsListFiltersSheet } from "./use-events-list-filters-sheet";

type EventsListFiltersSheetProps = {
  visible: boolean;
  draft: EventsListFilters;
  onClose: () => void;
  onChangeRole: (role: AccessLevel) => void;
  onChangeDateFrom: (value: string | null) => void;
  onChangeDateTo: (value: string | null) => void;
  onReset: () => void;
  onApply: () => void;
};

export const EventsListFiltersSheet = ({
  visible,
  draft,
  onClose,
  onChangeRole,
  onChangeDateFrom,
  onChangeDateTo,
  onReset,
  onApply,
}: EventsListFiltersSheetProps) => {
  const { activeDateField, toggleDateField, closeDatePicker, handleDateChange, datePickerValue, datePickerDisplay } =
    useEventsListFiltersSheet({ visible, draft, onChangeDateFrom, onChangeDateTo });

  return (
    <BottomSheet
      testID="events-list-filters-sheet"
      visible={visible}
      onClose={onClose}
      title="Filter My Events"
      dismissAccessibilityLabel="Dismiss filters"
      closeAccessibilityLabel="Close filters"
    >
      {activeDateField ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close date picker"
          className="absolute inset-0 z-10"
          onPress={closeDatePicker}
        />
      ) : null}

      <View className="gap-3">
        <ThemedText className="text-sm font-medium" tone="muted">
          My Role
        </ThemedText>
        <View className="flex-row gap-2">
          {EVENT_ROLE_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              label={label}
              variant="soft"
              selected={draft.roles.includes(value)}
              accessibilityLabel={`Filter by ${label}`}
              onPress={() => onChangeRole(value)}
              className="flex-1"
            />
          ))}
        </View>
      </View>

      <View className="gap-3">
        <ThemedText className="text-sm font-medium" tone="muted">
          Date Range
        </ThemedText>
        <View className="flex-row gap-3">
          <View className="flex-1 gap-2">
            <ThemedText className="text-sm font-medium">From</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter from date"
              onPress={() => toggleDateField("from")}
              className="h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4"
            >
              <AppIcon icon={Calendar} size="xs" className="text-muted" />
              <ThemedText className="text-base" tone={draft.dateFrom ? "foreground" : "subtle"}>
                {displayFilterDay(draft.dateFrom)}
              </ThemedText>
            </Pressable>
          </View>
          <View className="flex-1 gap-2">
            <ThemedText className="text-sm font-medium">To</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter to date"
              onPress={() => toggleDateField("to")}
              className="h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4"
            >
              <AppIcon icon={Calendar} size="xs" className="text-muted" />
              <ThemedText className="text-base" tone={draft.dateTo ? "foreground" : "subtle"}>
                {displayFilterDay(draft.dateTo)}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {activeDateField ? (
          <View className="z-20" pointerEvents="box-none">
            <DateTimePicker
              value={datePickerValue}
              mode="date"
              display={datePickerDisplay}
              onChange={handleDateChange}
            />
          </View>
        ) : null}
      </View>

      <View className="flex-row gap-3">
        <Button
          title="Reset"
          accessibilityLabel="Reset filters"
          variant="secondary"
          onPress={onReset}
          fullWidth={false}
          className="flex-1"
        />
        <Button
          title="Apply Filters"
          accessibilityLabel="Apply filters"
          onPress={onApply}
          fullWidth={false}
          className="flex-1"
        />
      </View>
    </BottomSheet>
  );
};
