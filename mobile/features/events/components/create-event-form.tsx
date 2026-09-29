import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { H1 } from "@/components/ui/heading";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ThemedText } from "@/components/ui/themed-text";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Clock } from "lucide-react-native";
import { Controller, type Control } from "react-hook-form";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";

import type { AccessLevel, CreateEventValues, EventResponseDto } from "../types";
import { EventCreatedConfirmation } from "./event-created-confirmation";

type CreateEventFormProps = {
  control: Control<CreateEventValues>;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  createdEvent: EventResponseDto | null;
  handleCopyLink: (invitationUrl: string) => void;
  handleShareLink: (invitationUrl: string, accessLevel: AccessLevel) => void;
  handleGoToEvent: () => void;
  handleShareLater: () => void;
};

export const CreateEventForm = ({
  control,
  isSubmitting,
  error,
  onSubmit,
  createdEvent,
  handleCopyLink,
  handleShareLink,
  handleGoToEvent,
  handleShareLater,
}: CreateEventFormProps) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  if (createdEvent) {
    return (
      <EventCreatedConfirmation
        event={createdEvent}
        onCopyLink={handleCopyLink}
        onShare={handleShareLink}
        onGoToEvent={handleGoToEvent}
        onShareLater={handleShareLater}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pb-6 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <H1>Create an Event</H1>
          <ThemedText className="text-sm" tone="muted">
            Fill in the details below to create your event and get a shareable invitation link.
          </ThemedText>
        </View>

        <View className="gap-4">
          {showDatePicker || showTimePicker ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date and time picker"
              className="absolute inset-0 z-10"
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}
            />
          ) : null}

          <FormField
            control={control}
            name="title"
            label="Event Title"
            placeholder="Enter event name"
            editable={!isSubmitting}
          />

          <FormField
            control={control}
            name="description"
            label="Description (optional)"
            placeholder="What's this event about?"
            editable={!isSubmitting}
          />

          <Controller
            control={control}
            name="date"
            render={({ field, fieldState }) => {
              const date = field.value;
              return (
                <View className="gap-2">
                  <ThemedText className="text-sm font-medium">Date & Time</ThemedText>
                  <View className="flex-row gap-3">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose date"
                      disabled={isSubmitting}
                      onPress={() => {
                        setShowTimePicker(false);
                        setShowDatePicker(true);
                      }}
                      className={[
                        "h-12 flex-1 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4",
                        isSubmitting ? "opacity-50" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <AppIcon icon={Calendar} size="sm" className="text-muted" />
                      <ThemedText className="text-base">{formatDate(date)}</ThemedText>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose time"
                      disabled={isSubmitting}
                      onPress={() => {
                        setShowDatePicker(false);
                        setShowTimePicker(true);
                      }}
                      className={[
                        "h-12 flex-1 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4",
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
                    <View className="z-20" pointerEvents="box-none">
                      <DateTimePicker
                        value={date}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === "android") setShowDatePicker(false);
                          field.onBlur();
                          if (event.type === "set" && selectedDate) {
                            const next = new Date(date);
                            next.setFullYear(
                              selectedDate.getFullYear(),
                              selectedDate.getMonth(),
                              selectedDate.getDate(),
                            );
                            field.onChange(next);
                          }
                        }}
                        minimumDate={new Date()}
                      />
                    </View>
                  ) : null}

                  {showTimePicker ? (
                    <View className="z-20" pointerEvents="box-none">
                      <DateTimePicker
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
                    </View>
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
        </View>

        {error ? (
          <View className="rounded-2xl border border-danger bg-surface p-4">
            <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
              {error}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <View className="px-4 pt-3 pb-4">
        <Button
          title="Create Event"
          onPress={() => {
            setShowDatePicker(false);
            setShowTimePicker(false);
            onSubmit();
          }}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        />
      </View>
    </SafeAreaView>
  );
};
