import { ThemedView } from "@/components/themed-view";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import EventInvitationModal from "../component/event-invitation-modal";
import EventsList from "../component/events-list";
import { useEventsListScreen } from "../hooks/use-events-list-screen";

const EventsListScreen = () => {
  const {
    events,
    isLoading,
    refreshing,
    currentUserId,
    selectedEvent,
    invitationModalVisible,
    onRefresh,
    handleEventShare,
    handleCloseInvitationModal,
  } = useEventsListScreen();

  return (
    <ThemedView className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl testID="events-list-refresh" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <EventsList
          isLoading={isLoading}
          events={events}
          onEventShare={handleEventShare}
          currentUserId={currentUserId}
        />
      </ScrollView>

      {selectedEvent && (
        <EventInvitationModal
          visible={invitationModalVisible}
          onClose={handleCloseInvitationModal}
          event={selectedEvent}
        />
      )}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});

export default EventsListScreen;
