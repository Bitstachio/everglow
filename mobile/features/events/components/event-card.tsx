import { H3 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { Event } from "../types";

type EventCardProps = {
  event: Event;
  onPress: () => void;
  onShare?: () => void;
};

export const EventCard = ({ event, onPress, onShare }: EventCardProps) => {
  const colorScheme = useColorScheme();
  const muted = colorTokens[colorScheme].muted;
  const accent = colorTokens[colorScheme].accent;

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
              <Ionicons name="share-outline" size={IconSize.sm} color={accent} />
            </IconButton>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={IconSize.xs} color={muted} />
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
