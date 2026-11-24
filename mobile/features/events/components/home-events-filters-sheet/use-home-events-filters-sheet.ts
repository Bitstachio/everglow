import { useState } from "react";
import { Platform } from "react-native";
import { formatFilterDay, parseFilterDay } from "../../utils";
import type { HomeEventsFilters } from "../../lib/home-events-filters";

export type HomeEventsDateField = "from" | "to";

type UseHomeEventsFiltersSheetArgs = {
  visible: boolean;
  draft: HomeEventsFilters;
  onChangeDateFrom: (value: string | null) => void;
  onChangeDateTo: (value: string | null) => void;
};

export const useHomeEventsFiltersSheet = ({
  visible,
  draft,
  onChangeDateFrom,
  onChangeDateTo,
}: UseHomeEventsFiltersSheetArgs) => {
  const [activeDateField, setActiveDateField] = useState<HomeEventsDateField | null>(null);

  if (!visible && activeDateField !== null) {
    setActiveDateField(null);
  }

  const toggleDateField = (field: HomeEventsDateField) => {
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
