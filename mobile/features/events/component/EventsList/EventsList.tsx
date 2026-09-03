import { H2 } from "@/components/ui/ThemedText/Heading/Heading";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { Event } from "../../types";
import EventCard from "../EventCard/EventCard";
import NoEventsBanner from "../NoEventsBanner/NoEventsBanner";

type EventsListProps = {
  title: string;
  isLoading: boolean;
  events: Event[];
  onEventShare?: (event: Event) => void;
  currentUserId?: string;
};

// TODO: Implement onPress for EventCard
const EventsList = ({ title, isLoading, events, onEventShare, currentUserId }: EventsListProps) => {
  const router = useRouter();

  return (
    <View className="gap-4">
      <H2>{title}</H2>
      {isLoading ? (
        <View className="py-12 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : events.length === 0 ? (
        <NoEventsBanner />
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
export default EventsList;
