import { Avatar } from "@/components/ui/avatar";
import { colorTokens } from "@/theme/tokens";
import { EventActionCard } from "../components/event-action-card";
import { EventInvitationModal } from "../components/event-invitation-modal";
import { EventsList } from "../components/events-list";
import { JoinEventSheet } from "../components/join-event-sheet";
import { useEventsScreen } from "../hooks/use-events-screen";
import { CirclePlus, QrCode } from "lucide-react-native";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EventsScreen = () => {
  const insets = useSafeAreaInsets();
  const {
    events,
    isLoading,
    refreshing,
    currentUserId,
    profileAvatar,
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
    <View style={[styles.container, styles.containerColors]}>
      <View style={[styles.brandHeader, { paddingTop: insets.top + 16 }]}>
        <Text accessibilityRole="header" style={[styles.wordmark, styles.textColors]}>
          Everglow
        </Text>
        <TouchableOpacity
          testID="events-profile-button"
          accessibilityRole="button"
          accessibilityLabel="Account Settings"
          onPress={handleOpenAccountSettings}
          style={styles.profileControl}
        >
          <Avatar {...profileAvatar} size="header" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={[styles.scrollView, styles.containerColors]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl testID="events-refresh" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.subtitle, styles.subtitleColors]}>
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
  containerColors: {
    backgroundColor: colorTokens.background,
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
  },
  subtitle: {
    fontSize: 16,
  },
  subtitleColors: {
    color: colorTokens.muted,
  },
  textColors: {
    color: colorTokens.text,
  },
  actionCards: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
});

export default EventsScreen;
