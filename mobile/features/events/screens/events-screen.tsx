import { useColorScheme } from "@/hooks/use-color-scheme";
import { EventActionCard } from "../components/event-action-card";
import { EventInvitationModal } from "../components/event-invitation-modal";
import { EventsList } from "../components/events-list";
import { JoinEventSheet } from "../components/join-event-sheet";
import { useEventsScreen } from "../hooks/use-events-screen";
import { CirclePlus, QrCode } from "lucide-react-native";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
    profileInitial,
    handleOpenAccountSettings,
    joinSheetVisible,
    selectedEvent,
    invitationModalVisible,
    onRefresh,
    handleJoinViaLink,
    form,
    onSubmit,
    handleOpenJoinSheet,
    handleCloseJoinSheet,
    handleCreateEvent,
    handleEventShare,
    handleCloseInvitationModal,
  } = useEventsScreen();

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={[styles.brandHeader, { paddingTop: insets.top + 16 }]}>
        <Text accessibilityRole="header" style={[styles.wordmark, isDark ? styles.textDark : styles.textLight]}>
          Everglow
        </Text>
        <TouchableOpacity
          testID="events-profile-button"
          accessibilityRole="button"
          accessibilityLabel="Account Settings"
          onPress={handleOpenAccountSettings}
          style={styles.profileControl}
        >
          <Text style={styles.profileInitial}>{profileInitial}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={[styles.scrollView, isDark ? styles.containerDark : styles.containerLight]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl testID="events-refresh" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
            Discover events, join with QR codes or links, and create your own meetups to share with the community.
          </Text>
        </View>

        <View style={styles.actionCards}>
          <EventActionCard
            title="Join Event"
            description="Scan QR or paste link"
            icon={QrCode}
            onPress={handleOpenJoinSheet}
          />
          <EventActionCard
            title="Create Event"
            description="Host your own meetup"
            icon={CirclePlus}
            onPress={handleCreateEvent}
          />
        </View>

        <EventsList
          title="My Events"
          isLoading={isLoading}
          events={events}
          onEventShare={handleEventShare}
          currentUserId={currentUserId}
          seeAllHref="/events/list"
        />
      </ScrollView>

      <JoinEventSheet
        visible={joinSheetVisible}
        onClose={handleCloseJoinSheet}
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
  brandHeader: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "bold",
  },
  profileControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
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
