import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Clock } from "lucide-react-native";
import { Controller, type Control } from "react-hook-form";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import type { EditEventDateValues } from "../types";

type EditEventDateFormProps = {
  control: Control<EditEventDateValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
};

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

export const EditEventDateForm = ({ control, isDirty, isSubmitting, error, onSubmit }: EditEventDateFormProps) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pt-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
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
                    <AppIcon icon={Calendar} size="sm" className="text-muted" />
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
                    <AppIcon icon={Clock} size="sm" className="text-muted" />
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

        <ThemedText tone="muted" className="text-sm">
          Guests see this date and time on the event details screen.
        </ThemedText>

        {error ? (
          <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>

      <View className="px-4 pt-3 pb-4">
        <Button
          title="Save"
          onPress={() => {
            setShowDatePicker(false);
            setShowTimePicker(false);
            onSubmit();
          }}
          isLoading={isSubmitting}
          disabled={isSubmitting || !isDirty}
        />
      </View>
    </View>
  );
};
