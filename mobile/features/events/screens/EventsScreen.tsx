import { useColorScheme } from "@/hooks/use-color-scheme";
import EventActionCard from "@/features/events/component/EventActionCard/EventActionCard";
import EventsList from "@/features/events/component/EventsList/EventsList";
import JoinEventModal from "@/features/events/component/JoinEventModal/JoinEventModal";
import EventInvitationModal from "@/features/events/component/EventInvitationModal/EventInvitationModal";
import { Event } from "@/features/events/types";
import { getUserEvents, joinEventByUrl } from "@/lib/event";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { useCallback, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EventsScreen = () => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isJoiningRef = useRef(false);

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [invitationModalVisible, setInvitationModalVisible] = useState(false);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedEvents = await getUserEvents();
      setEvents(
        fetchedEvents.map((event) => ({
          ...event,
          isJoined: true,
        })),
      );
    } catch (error: any) {
      console.error("Failed to fetch events:", error);
      Alert.alert("Error", error.response?.data?.message || "Failed to fetch events");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents();
  }, [fetchEvents]);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [fetchEvents]),
  );

  const handleJoinViaLink = useCallback(
    async (invitationUrl: string) => {
      if (isJoiningRef.current) return; // Prevent duplicate calls

      isJoiningRef.current = true;
      try {
        const result = await joinEventByUrl(invitationUrl);
        setJoinModalVisible(false);
        // Check if the event was already joined by comparing with existing events
        const wasAlreadyJoined = events.some((event) => event.id === result.id);

        // Refetch events to get the updated list
        await fetchEvents();

        // Show appropriate alert
        if (wasAlreadyJoined) {
          Alert.alert("Already Joined", "You are already a member of this event.");
        } else {
          Alert.alert("Success", "You have successfully joined the event!");
        }
      } catch (error: any) {
        console.error("Failed to join event:", error);
        const errorMessage = error.response?.data?.message || "Failed to join event";
        Alert.alert("Error", errorMessage);
      } finally {
        isJoiningRef.current = false;
      }
    },
    [fetchEvents, events],
  );

  const handleEventShare = useCallback((event: Event) => {
    setSelectedEvent(event);
    setInvitationModalVisible(true);
  }, []);

  const handleCloseInvitationModal = useCallback(() => {
    setInvitationModalVisible(false);
    setSelectedEvent(null);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={[styles.scrollView, isDark ? styles.containerDark : styles.containerLight]}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>Events</Text>
          <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            Discover events, join with QR codes or links, and create your own meetups to share with the community.
          </Text>
        </View>

        <View style={styles.actionCards}>
          <EventActionCard
            title="Join Event"
            description="Scan QR or paste link"
            onPress={() => setJoinModalVisible(true)}
          />
          <EventActionCard
            title="Create Event"
            description="Host your own meetup"
            onPress={() => router.push("/events/create")}
          />
        </View>

        <EventsList
          title="Upcoming Events"
          isLoading={isLoading}
          events={events}
          onEventShare={handleEventShare}
          currentUserId={user?.id}
        />
      </ScrollView>

      <JoinEventModal
        visible={joinModalVisible}
        onClose={() => setJoinModalVisible(false)}
        onJoinLink={handleJoinViaLink}
      />

      {selectedEvent && (
        <EventInvitationModal
          visible={invitationModalVisible}
          onClose={handleCloseInvitationModal}
          event={selectedEvent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: "#F9FAFB",
  },
  containerDark: {
    backgroundColor: "#111827",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 24,
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
  actionCards: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
});

export default EventsScreen;
