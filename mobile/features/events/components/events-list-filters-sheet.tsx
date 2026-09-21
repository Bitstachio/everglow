import { ThemedText } from "@/components/ui/themed-text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import type { AccessLevel } from "../types";
import {
  displayFilterDay,
  EVENT_ROLE_OPTIONS,
  formatFilterDay,
  parseFilterDay,
  type EventsListFilters,
} from "../utils";

type DateField = "from" | "to";

type EventsListFiltersSheetProps = {
  visible: boolean;
  draft: EventsListFilters;
  onClose: () => void;
  onChangeRole: (role: AccessLevel | null) => void;
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
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear transient picker when parent hides sheet */
    if (!visible) setActiveDateField(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible]);

  const handleDateChange = (field: DateField, event: { type: string }, selectedDate?: Date) => {
    if (Platform.OS === "android") setActiveDateField(null);
    if (event.type !== "set" || !selectedDate) return;
    const next = formatFilterDay(selectedDate);
    if (field === "from") onChangeDateFrom(next);
    else onChangeDateTo(next);
  };

  return (
    <Modal
      testID="events-list-filters-sheet"
      animationType="slide"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/45">
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss filters" className="flex-1" onPress={onClose} />
        <View className="rounded-t-3xl bg-background px-6 pb-8 pt-3 gap-6">
          {activeDateField ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
              className="absolute inset-0 z-10"
              onPress={() => setActiveDateField(null)}
            />
          ) : null}

          <View className="items-center">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="flex-row items-center justify-between">
            <ThemedText className="text-xl font-bold">Filter My Events</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface"
            >
              <Ionicons name="close" size={18} color="#64748B" />
            </Pressable>
          </View>

          <View className="gap-3">
            <ThemedText className="text-sm font-medium" textColor="muted">
              My Role
            </ThemedText>
            <View className="flex-row gap-2">
              {EVENT_ROLE_OPTIONS.map(({ value, label }) => {
                const selected = draft.role === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Filter by ${label}`}
                    onPress={() => onChangeRole(selected ? null : value)}
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
                  onPress={() => setActiveDateField(activeDateField === "from" ? null : "from")}
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
                  onPress={() => setActiveDateField(activeDateField === "to" ? null : "to")}
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
                  value={parseFilterDay(activeDateField === "from" ? draft.dateFrom : draft.dateTo)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, selectedDate) => handleDateChange(activeDateField, event, selectedDate)}
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
        </View>
      </View>
    </Modal>
  );
};
