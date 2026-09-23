import { useState } from "react";
import { Platform } from "react-native";
import { formatFilterDay, parseFilterDay, type EventsListFilters } from "../../utils";

export type DateField = "from" | "to";

type UseEventsListFiltersSheetArgs = {
  visible: boolean;
  draft: EventsListFilters;
  onChangeDateFrom: (value: string | null) => void;
  onChangeDateTo: (value: string | null) => void;
};

export const useEventsListFiltersSheet = ({
  visible,
  draft,
  onChangeDateFrom,
  onChangeDateTo,
}: UseEventsListFiltersSheetArgs) => {
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);

  if (!visible && activeDateField !== null) {
    setActiveDateField(null);
  }

  const toggleDateField = (field: DateField) => {
    setActiveDateField((current) => (current === field ? null : field));
  };

  const closeDatePicker = () => setActiveDateField(null);

  const handleDateChange = (event: { type: string }, selectedDate?: Date) => {
    if (!activeDateField) return;
    if (Platform.OS === "android") setActiveDateField(null);
    if (event.type !== "set" || !selectedDate) return;
    const next = formatFilterDay(selectedDate);
    if (activeDateField === "from") onChangeDateFrom(next);
    else onChangeDateTo(next);
  };

  const datePickerValue = activeDateField
    ? parseFilterDay(activeDateField === "from" ? draft.dateFrom : draft.dateTo)
    : new Date();

  return {
    activeDateField,
    toggleDateField,
    closeDatePicker,
    handleDateChange,
    datePickerValue,
    datePickerDisplay: Platform.OS === "ios" ? ("spinner" as const) : ("default" as const),
  };
};
