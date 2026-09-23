import { AppIcon } from "@/components/ui/app-icon";
import { H2 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { Calendar } from "lucide-react-native";
import { View } from "react-native";
import type { Event } from "../types";
import { formatEventDateTime } from "../utils";

type EventDetailInfoProps = {
  event: Event;
};

export const EventDetailInfo = ({ event }: EventDetailInfoProps) => {
  const { date, time } = formatEventDateTime(event.date);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-background p-4">
      <H2>{event.title}</H2>

      <View className="flex-row items-start gap-3">
        <AppIcon icon={Calendar} size="sm" className="text-accent" />
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
