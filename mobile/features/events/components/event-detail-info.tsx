import { H2 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSize } from "@/constants/icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import type { Event } from "../types";
import { formatEventDateTime } from "../utils";

type EventDetailInfoProps = {
  event: Event;
};

export const EventDetailInfo = ({ event }: EventDetailInfoProps) => {
  const colorScheme = useColorScheme();
  const accent = colorTokens[colorScheme].accent;
  const { date, time } = formatEventDateTime(event.date);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-background p-4">
      <H2>{event.title}</H2>

      <View className="flex-row items-start gap-3">
        <Ionicons name="calendar-outline" size={IconSize.sm} color={accent} />
        <View className="flex-1 gap-1">
          <ThemedText className="text-xs font-medium uppercase" tone="muted">
            Date & Time
          </ThemedText>
          <ThemedText className="text-base">{date}</ThemedText>
          <ThemedText className="text-base">{time}</ThemedText>
        </View>
      </View>

      {event.description ? (
        <View className="gap-2">
          <ThemedText className="text-xs font-medium uppercase" tone="muted">
            Description
          </ThemedText>
          <ThemedText className="text-base">{event.description}</ThemedText>
        </View>
      ) : null}
    </View>
  );
};
