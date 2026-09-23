import { AppIcon } from "@/components/ui/app-icon";
import { H3 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { Calendar, Share2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Event } from "../types";

type EventCardProps = {
  event: Event;
  onPress: () => void;
  onShare?: () => void;
};

export const EventCard = ({ event, onPress, onShare }: EventCardProps) => {
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}`}
      onPress={onPress}
      className="rounded-2xl border border-border bg-background p-4 active:opacity-80"
    >
      <View className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <H3>{event.title}</H3>
          </View>
          {onShare ? (
            <IconButton
              accessibilityLabel={`Share ${event.title}`}
              onPress={(e) => {
                e.stopPropagation?.();
                onShare();
              }}
              className="bg-surface"
            >
              <AppIcon icon={Share2} size="sm" className="text-accent" />
            </IconButton>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <AppIcon icon={Calendar} size="xs" className="text-muted" />
          <ThemedText className="text-sm" tone="muted">
            {formattedDate} • {time}
          </ThemedText>
        </View>

        {event.description ? (
          <ThemedText className="text-sm line-clamp-2" tone="muted">
            {event.description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
};
