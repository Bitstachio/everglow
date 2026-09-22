import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input/input";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Event } from "../types";

type EditEventModalProps = {
  visible: boolean;
  event: Event;
  onClose: () => void;
  onSave: (data: { title: string; description: string; date: string }) => Promise<void>;
};

export const EditEventModal = ({ visible, event, onClose, onSave }: EditEventModalProps) => {
  const colorScheme = useColorScheme();
  const muted = colorTokens[colorScheme].muted;

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [selectedDate, setSelectedDate] = useState(new Date(event.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (_event: unknown, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleTimeChange = (_event: unknown, date?: Date) => {
    setShowTimePicker(false);
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
      setSelectedDate(newDate);
    }
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Edit Event"
      dismissAccessibilityLabel="Dismiss edit event"
      closeAccessibilityLabel="Close edit event"
    >
      <View className="gap-4">
        <Input
          label="Event Title"
          value={title}
          placeholder="Enter event title"
          onChangeText={(text) => {
            setTitle(text);
            setError(null);
          }}
        />

        <Input
          label="Description"
          value={description}
          placeholder="Enter event description"
          onChangeText={(text) => {
            setDescription(text);
            setError(null);
          }}
        />

        <View className="gap-2">
          <ThemedText className="text-sm font-medium">Date</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose date"
            onPress={() => setShowDatePicker(true)}
            className="h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4"
          >
            <Ionicons name="calendar-outline" size={IconSize.sm} color={muted} />
            <ThemedText className="text-base">{formatDate(selectedDate)}</ThemedText>
          </Pressable>
        </View>

        <View className="gap-2">
          <ThemedText className="text-sm font-medium">Time</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose time"
            onPress={() => setShowTimePicker(true)}
            className="h-12 flex-row items-center gap-2 rounded-2xl border border-border bg-background px-4"
          >
            <Ionicons name="time-outline" size={IconSize.sm} color={muted} />
            <ThemedText className="text-base">{formatTime(selectedDate)}</ThemedText>
          </Pressable>
        </View>

        {error ? (
          <ThemedText accessibilityRole="alert" tone="danger" className="text-sm">
            {error}
          </ThemedText>
        ) : null}
      </View>

      {showDatePicker ? (
        <DateTimePicker value={selectedDate} mode="date" display="default" onChange={handleDateChange} />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker value={selectedDate} mode="time" display="default" onChange={handleTimeChange} />
      ) : null}

      <View className="gap-3">
        <Button title="Save Changes" onPress={handleSave} isLoading={isLoading} disabled={isLoading} />
        <Button title="Cancel" onPress={onClose} variant="outline" disabled={isLoading} />
      </View>
    </BottomSheet>
  );
};
