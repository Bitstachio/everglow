import { useColorScheme } from "@/hooks/use-color-scheme";
import EventActionCard from "../component/event-action-card";
import EventsList from "../component/events-list";
import JoinEventModal from "../component/join-event-modal";
import EventInvitationModal from "../component/event-invitation-modal";
import { useEventsScreen } from "../hooks/use-events-screen";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EventsScreen = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const {
    events,
    isLoading,
    refreshing,
    currentUserId,
    joinModalVisible,
    selectedEvent,
    invitationModalVisible,
    onRefresh,
    handleJoinViaLink,
    form,
    onSubmit,
    handleOpenJoinModal,
    handleCloseJoinModal,
    handleCreateEvent,
    handleEventShare,
    handleCloseInvitationModal,
  } = useEventsScreen();

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
          <EventActionCard title="Join Event" description="Scan QR or paste link" onPress={handleOpenJoinModal} />
          <EventActionCard title="Create Event" description="Host your own meetup" onPress={handleCreateEvent} />
        </View>

        <EventsList
          title="Upcoming Events"
          isLoading={isLoading}
          events={events}
          onEventShare={handleEventShare}
          currentUserId={currentUserId}
        />
      </ScrollView>

      <JoinEventModal
        visible={joinModalVisible}
        onClose={handleCloseJoinModal}
        control={form.control}
        isSubmitting={form.formState.isSubmitting}
        onSubmit={onSubmit}
        onScan={handleJoinViaLink}
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
