import { H2 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Href, Link, useRouter } from "expo-router";
import { Event } from "../types";
import { EventCard } from "./event-card";
import { NoEventsBanner } from "./no-events-banner";

type EventsListProps = {
  title?: string;
  isLoading: boolean;
  events: Event[];
  onEventShare?: (event: Event) => void;
  currentUserId?: string;
  seeAllHref?: Href;
  /** When true and the list is empty, show filter-miss copy instead of the first-run empty state. */
  filtersActive?: boolean;
};

// TODO: Implement onPress for EventCard
export const EventsList = ({
  title,
  isLoading,
  events,
  onEventShare,
  currentUserId,
  seeAllHref,
  filtersActive = false,
}: EventsListProps) => {
  const router = useRouter();

  return (
    <View className="gap-4">
      {title || seeAllHref ? (
        <View className="flex-row items-center justify-between gap-3">
          {title ? <H2>{title}</H2> : <View />}
          {seeAllHref ? (
            <Link href={seeAllHref} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="See all events">
                <ThemedText className="text-sm font-medium" textColor="muted">
                  See all →
                </ThemedText>
              </Pressable>
            </Link>
          ) : null}
        </View>
      ) : null}
      {isLoading ? (
        <View className="py-12 items-center justify-center">
          <ActivityIndicator accessibilityLabel="Loading events" size="large" color="#3B82F6" />
        </View>
      ) : events.length === 0 ? (
        <NoEventsBanner variant={filtersActive ? "no-matches" : "empty"} />
      ) : (
        <View className="gap-4">
          {events.map((event) => {
            const isCreator = currentUserId != null && event.creatorId === currentUserId;
            return (
              <EventCard
                key={event.id}
                event={event}
                onPress={() => router.push(`/events/${event.id}`)}
                onShare={isCreator && onEventShare ? () => onEventShare(event) : undefined}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};
