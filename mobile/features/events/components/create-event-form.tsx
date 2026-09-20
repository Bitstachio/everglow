import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Controller, type Control } from "react-hook-form";
import { useColorScheme } from "@/hooks/use-color-scheme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import type { CreateEventValues, EventResponseDto } from "../types";

type CreateEventFormProps = {
  control: Control<CreateEventValues>;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  createdEvent: EventResponseDto | null;
  handleCopyLink: () => void;
  handleShareLink: () => void;
  handleCreateAnother: () => void;
  handleDone: () => void;
};

export const CreateEventForm = ({
  control,
  isSubmitting,
  error,
  onSubmit,
  createdEvent,
  handleCopyLink,
  handleShareLink,
  handleCreateAnother,
  handleDone,
}: CreateEventFormProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (createdEvent) {
    return (
      <ScrollView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
        <View style={styles.content}>
          <View style={styles.successHeader}>
            <View style={[styles.successIcon, isDark ? styles.successIconDark : styles.successIconLight]}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>
            <Text style={[styles.successTitle, isDark ? styles.textDark : styles.textLight]}>
              Event Created Successfully!
            </Text>
            <Text style={[styles.successSubtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Share this event with your attendees
            </Text>
          </View>

          <View style={[styles.summaryCard, isDark ? styles.summaryCardDark : styles.summaryCardLight]}>
            <Text style={[styles.eventTitle, isDark ? styles.textDark : styles.textLight]}>{createdEvent.title}</Text>
            <Text style={[styles.eventDescription, isDark ? styles.descriptionDark : styles.descriptionLight]}>
              {createdEvent.description}
            </Text>
          </View>

          <View style={[styles.qrContainer, isDark ? styles.qrContainerDark : styles.qrContainerLight]}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>QR Code</Text>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={createdEvent.invitationUrl}
                size={200}
                backgroundColor={isDark ? "#1F2937" : "#FFFFFF"}
                color={isDark ? "#F9FAFB" : "#111827"}
              />
            </View>
            <Text style={[styles.qrHint, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              Attendees can scan this QR code to join
            </Text>
          </View>

          <View style={styles.linkSection}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Invitation Link</Text>
            <TouchableOpacity
              style={[styles.linkContainer, isDark ? styles.linkContainerDark : styles.linkContainerLight]}
              onPress={handleCopyLink}
            >
              <Text style={[styles.linkText, isDark ? styles.linkTextDark : styles.linkTextLight]} numberOfLines={1}>
                {createdEvent.invitationUrl}
              </Text>
              <Ionicons name="copy-outline" size={20} color="#6366F1" />
            </TouchableOpacity>
          </View>

          <View style={styles.actionButtons}>
            <Button title="Share Link" onPress={handleShareLink} />
            <View style={styles.buttonSpacing} />
            <Button title="Create Another Event" onPress={handleCreateAnother} variant="outline" />
            <View style={styles.buttonSpacing} />
            <Button title="Done" onPress={handleDone} variant="outline" />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>Create an Event</Text>
          <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            Fill in the details below to create your event and get a shareable invitation link.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Overlay to close pickers when clicking outside */}
          {(showDatePicker || showTimePicker) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date and time picker"
              style={styles.pickerOverlay}
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}
            />
          )}
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
                <>
                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, isDark ? styles.labelDark : styles.labelLight]}>Date & Time</Text>
                    <View style={styles.dateTimeContainer}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Choose date"
                        disabled={isSubmitting}
                        onPress={() => {
                          setShowTimePicker(false);
                          setShowDatePicker(true);
                        }}
                        style={[styles.dateTimeButton, isDark ? styles.dateTimeButtonDark : styles.dateTimeButtonLight]}
                      >
                        <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                        <Text style={[styles.dateTimeText, isDark ? styles.textDark : styles.textLight]}>
                          {formatDate(date)}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Choose time"
                        disabled={isSubmitting}
                        onPress={() => {
                          setShowDatePicker(false);
                          setShowTimePicker(true);
                        }}
                        style={[styles.dateTimeButton, isDark ? styles.dateTimeButtonDark : styles.dateTimeButtonLight]}
                      >
                        <Ionicons name="time-outline" size={20} color="#6B7280" />
                        <Text style={[styles.dateTimeText, isDark ? styles.textDark : styles.textLight]}>
                          {formatTime(date)}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {showDatePicker && (
                    <View style={styles.pickerWrapper} pointerEvents="box-none">
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
                  )}

                  {showTimePicker && (
                    <View style={styles.pickerWrapper} pointerEvents="box-none">
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
                  )}

                  {fieldState.error && <Text style={styles.errorText}>{fieldState.error.message}</Text>}
                </>
              );
            }}
          />
        </View>

        {error && (
          <View style={[styles.errorContainer, isDark ? styles.errorContainerDark : styles.errorContainerLight]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  pickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.01)",
    zIndex: 10,
  },
  pickerWrapper: {
    zIndex: 20,
  },
  container: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: "#F9FAFB",
  },
  containerDark: {
    backgroundColor: "#111827",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  subtitleLight: {
    color: "#6B7280",
  },
  subtitleDark: {
    color: "#9CA3AF",
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  labelLight: {
    color: "#374151",
  },
  labelDark: {
    color: "#E5E7EB",
  },
  dateTimeContainer: {
    flexDirection: "row",
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateTimeButtonLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  dateTimeButtonDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  dateTimeText: {
    fontSize: 16,
  },
  errorContainer: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
  },
  errorContainerLight: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  errorContainerDark: {
    backgroundColor: "#7F1D1D",
    borderColor: "#991B1B",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
  },
  successHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successIconLight: {
    backgroundColor: "#D1FAE5",
  },
  successIconDark: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  summaryCard: {
    padding: 20,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
  },
  summaryCardLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  summaryCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 16,
  },
  descriptionLight: {
    color: "#6B7280",
  },
  descriptionDark: {
    color: "#9CA3AF",
  },
  qrContainer: {
    padding: 24,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
  },
  qrContainerLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
  },
  qrContainerDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  qrCodeWrapper: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  qrHint: {
    fontSize: 14,
    textAlign: "center",
  },
  linkSection: {
    marginBottom: 24,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  linkContainerLight: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  linkContainerDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  linkText: {
    flex: 1,
    fontSize: 14,
  },
  linkTextLight: {
    color: "#6366F1",
  },
  linkTextDark: {
    color: "#818CF8",
  },
  actionButtons: {
    marginTop: 8,
  },
  buttonSpacing: {
    height: 12,
  },
});
