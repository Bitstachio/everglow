import AppTextInput from "@/components/ui/AppTextInput/AppTextInput";
import CancelButton from "@/components/ui/AppButton/CancelButton/CancelButton";
import PrimaryButton from "@/components/ui/AppButton/PrimaryButton/PrimaryButton";
import { H2 } from "@/components/ui/ThemedText/Heading/Heading";
import { ThemedText } from "@/components/ui/ThemedText/ThemedText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Event } from "../../types";

type EditEventModalProps = {
  visible: boolean;
  event: Event;
  onClose: () => void;
  onSave: (data: { title: string; description: string; date: string }) => Promise<void>;
};

const EditEventModal = ({ visible, event, onClose, onSave }: EditEventModalProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [selectedDate, setSelectedDate] = useState(new Date(event.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleTimeChange = (_event: any, date?: Date) => {
    setShowTimePicker(false);
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
      setSelectedDate(newDate);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleSave = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      return;
    }

    try {
      setIsLoading(true);
      await onSave({
        title: title.trim(),
        description: description.trim(),
        date: selectedDate.toISOString(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update event");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <H2>Edit Event</H2>
            </View>

            <View style={styles.form}>
              {/* Title Input */}
              <View style={styles.inputContainer}>
                <ThemedText textColor="muted" className="text-sm font-semibold mb-2">
                  Event Title
                </ThemedText>
                <AppTextInput
                  value={title}
                  placeholder="Enter event title"
                  onChangeText={(text) => {
                    setTitle(text);
                    setError(null);
                  }}
                />
              </View>

              {/* Description Input */}
              <View style={styles.inputContainer}>
                <ThemedText textColor="muted" className="text-sm font-semibold mb-2">
                  Description
                </ThemedText>
                <AppTextInput
                  value={description}
                  placeholder="Enter event description"
                  onChangeText={(text) => {
                    setDescription(text);
                    setError(null);
                  }}
                />
              </View>

              {/* Date Picker */}
              <View style={styles.inputContainer}>
                <ThemedText textColor="muted" className="text-sm font-semibold mb-2">
                  Date
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={[styles.dateButton, isDark ? styles.dateButtonDark : styles.dateButtonLight]}
                >
                  <Text style={[styles.dateButtonText, isDark ? styles.textDark : styles.textLight]}>
                    {formatDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Time Picker */}
              <View style={styles.inputContainer}>
                <ThemedText textColor="muted" className="text-sm font-semibold mb-2">
                  Time
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  style={[styles.dateButton, isDark ? styles.dateButtonDark : styles.dateButtonLight]}
                >
                  <Text style={[styles.dateButtonText, isDark ? styles.textDark : styles.textLight]}>
                    {formatTime(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Message */}
              {error && (
                <View style={styles.errorContainer}>
                  <ThemedText className="text-red-500 text-sm">{error}</ThemedText>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <PrimaryButton
                text={isLoading ? "Saving..." : "Save Changes"}
                onPress={handleSave}
                disabled={isLoading}
              />
              <CancelButton onPress={onClose} />
            </View>
          </ScrollView>

          {/* Date Picker Modal */}
          {showDatePicker && (
            <DateTimePicker value={selectedDate} mode="date" display="default" onChange={handleDateChange} />
          )}

          {/* Time Picker Modal */}
          {showTimePicker && (
            <DateTimePicker value={selectedDate} mode="time" display="default" onChange={handleTimeChange} />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  modalContentLight: {
    backgroundColor: "#FFFFFF",
  },
  modalContentDark: {
    backgroundColor: "#1F2937",
  },
  modalHeader: {
    marginBottom: 24,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  dateButton: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  dateButtonLight: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  dateButtonDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  dateButtonText: {
    fontSize: 16,
  },
  errorContainer: {
    marginTop: -8,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 24,
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#F9FAFB",
  },
});

export default EditEventModal;
