import { H3 } from "@/components/ui/ThemedText/Heading/Heading";
import { ThemedText } from "@/components/ui/ThemedText/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, TouchableOpacity, View } from "react-native";
import { Event } from "../../types";

type EventCardProps = {
  event: Event;
  onPress: () => void;
  onShare?: () => void;
};

const EventCard = ({ event, onPress, onShare }: EventCardProps) => {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    };
  };

  const { date: formattedDate, time } = formatDateTime(event.date);

  const handleSharePress = (e: any) => {
    e.stopPropagation();
    onShare?.();
  };

  return (
    <Pressable
      key={`joined-${event.id}`}
      onPress={onPress}
      className="border border-ui-border dark:border-dark-border rounded-3xl p-5 bg-white dark:bg-gray-800 shadow-sm active:opacity-80"
    >
      <View className="gap-3">
        {/* Header with Title and Share Button */}
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-2">
            <H3>{event.title}</H3>
          </View>
          {onShare && (
            <TouchableOpacity
              onPress={handleSharePress}
              className="w-8 h-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"
            >
              <Ionicons name="share-outline" size={18} color="#6366F1" />
            </TouchableOpacity>
          )}
        </View>

        {/* Date & Time */}
        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
            {formattedDate} • {time}
          </ThemedText>
        </View>

        {/* Description Preview */}
        {event.description && (
          <ThemedText className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{event.description}</ThemedText>
        )}
      </View>
    </Pressable>
  );
};

export default EventCard;
