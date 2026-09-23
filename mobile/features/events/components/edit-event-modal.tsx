import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Controller, type Control } from "react-hook-form";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import type { EditEventValues } from "../types";

type EditEventModalProps = {
  visible: boolean;
  control: Control<EditEventValues>;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  onClose: () => void;
};

export const EditEventModal = ({ visible, control, isSubmitting, error, onSubmit, onClose }: EditEventModalProps) => {
  const colorScheme = useColorScheme();
  const muted = colorTokens[colorScheme].muted;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <BottomSheet
      testID="edit-event-sheet"
      visible={visible}
      onClose={handleClose}
      title="Edit Event"
      dismissAccessibilityLabel="Dismiss edit event"
      closeAccessibilityLabel="Close edit event"
    >
      <View className="gap-4">
        <FormField
          control={control}
          name="title"
          label="Event Title"
          placeholder="Enter event title"
          editable={!isSubmitting}
        />

        <FormField
          control={control}
          name="description"
          label="Description"
          placeholder="Enter event description"
          editable={!isSubmitting}
        />

        <Controller
          control={control}
          name="date"
          render={({ field, fieldState }) => {
            const date = field.value instanceof Date && !Number.isNaN(field.value.getTime()) ? field.value : new Date();

            return (
              <View className="gap-4">
                <View className="gap-2">
                  <ThemedText className="text-sm font-medium">Date</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose date"
                    disabled={isSubmitting}
                    onPress={() => {
                      setShowTimePicker(false);
                      setShowDatePicker(true);
                    }}
                    className={[
                      "h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4",
                      isSubmitting ? "opacity-50" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Ionicons name="calendar-outline" size={IconSize.sm} color={muted} />
                    <ThemedText className="text-base">{formatDate(date)}</ThemedText>
                  </Pressable>
                </View>

                <View className="gap-2">
                  <ThemedText className="text-sm font-medium">Time</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose time"
                    disabled={isSubmitting}
                    onPress={() => {
                      setShowDatePicker(false);
                      setShowTimePicker(true);
                    }}
                    className={[
                      "h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4",
                      isSubmitting ? "opacity-50" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Ionicons name="time-outline" size={IconSize.sm} color={muted} />
                    <ThemedText className="text-base">{formatTime(date)}</ThemedText>
                  </Pressable>
                </View>

                {showDatePicker ? (
                  <DateTimePicker
                    testID="date-picker"
                    value={date}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === "android") setShowDatePicker(false);
                      field.onBlur();
                      if (event.type === "set" && selectedDate) {
                        const next = new Date(date);
                        next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        field.onChange(next);
                      }
                    }}
                  />
                ) : null}

                {showTimePicker ? (
                  <DateTimePicker
                    testID="time-picker"
                    value={date}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedTime) => {
                      if (Platform.OS === "android") setShowTimePicker(false);
                      field.onBlur();
                      if (event.type === "set" && selectedTime) {
                        const next = new Date(date);
                        next.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                        field.onChange(next);
                      }
                    }}
                  />
                ) : null}

                {fieldState.error ? (
                  <ThemedText accessibilityRole="alert" tone="danger" className="text-xs">
                    {fieldState.error.message}
                  </ThemedText>
                ) : null}
              </View>
            );
          }}
        />

        {error ? (
          <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
            {error}
          </ThemedText>
        ) : null}
      </View>

      <View className="gap-3">
        <Button
          title="Save Changes"
          onPress={() => {
            setShowDatePicker(false);
            setShowTimePicker(false);
            onSubmit();
          }}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        />
        <Button title="Cancel" onPress={handleClose} variant="outline" disabled={isSubmitting} />
      </View>
    </BottomSheet>
  );
};
