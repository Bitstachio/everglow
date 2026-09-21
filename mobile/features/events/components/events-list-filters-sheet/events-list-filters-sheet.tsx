import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
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
  const {
    activeDateField,
    toggleDateField,
    closeDatePicker,
    handleDateChange,
    datePickerValue,
    datePickerDisplay,
  } = useEventsListFiltersSheet({ visible, draft, onChangeDateFrom, onChangeDateTo });

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
        <ThemedText className="text-sm font-medium" textColor="muted">
          My Role
        </ThemedText>
        <View className="flex-row gap-2">
          {EVENT_ROLE_OPTIONS.map(({ value, label }) => {
            const selected = draft.roles.includes(value);
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Filter by ${label}`}
                onPress={() => onChangeRole(value)}
                className={`flex-1 items-center rounded-xl px-3 py-3 ${selected ? "bg-border" : "bg-surface"}`}
              >
                <ThemedText
                  className={`text-sm ${selected ? "font-semibold" : ""}`}
                  textColor={selected ? "main" : "muted"}
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-3">
        <ThemedText className="text-sm font-medium" textColor="muted">
          Date Range
        </ThemedText>
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1">
            <ThemedText className="text-xs" textColor="subtle">
              From
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter from date"
              onPress={() => toggleDateField("from")}
              className="flex-row items-center gap-2 rounded-xl border border-border px-3 py-3"
            >
              <Ionicons name="calendar-outline" size={16} color="#64748B" />
              <ThemedText className="text-sm" textColor={draft.dateFrom ? "main" : "subtle"}>
                {displayFilterDay(draft.dateFrom)}
              </ThemedText>
            </Pressable>
          </View>
          <View className="flex-1 gap-1">
            <ThemedText className="text-xs" textColor="subtle">
              To
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter to date"
              onPress={() => toggleDateField("to")}
              className="flex-row items-center gap-2 rounded-xl border border-border px-3 py-3"
            >
              <Ionicons name="calendar-outline" size={16} color="#64748B" />
              <ThemedText className="text-sm" textColor={draft.dateTo ? "main" : "subtle"}>
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

      <View className="flex-row gap-3 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset filters"
          onPress={onReset}
          className="flex-1 items-center rounded-xl bg-surface px-4 py-3.5"
        >
          <ThemedText className="text-base font-medium" textColor="muted">
            Reset
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apply filters"
          onPress={onApply}
          className="flex-[1.4] items-center rounded-xl bg-border px-4 py-3.5"
        >
          <ThemedText className="text-base font-semibold">Apply Filters</ThemedText>
        </Pressable>
      </View>
    </BottomSheet>
  );
};
