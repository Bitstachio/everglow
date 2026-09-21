import { ThemedView } from "@/components/themed-view";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { EventInvitationModal } from "../components/event-invitation-modal";
import { EventsList } from "../components/events-list";
import { EventsListFiltersButton } from "../components/events-list-filters-button";
import { EventsListFiltersSheet } from "../components/events-list-filters-sheet";
import { EventsListSortButton } from "../components/events-list-sort-button";
import { useEventsListScreen } from "../hooks/use-events-list-screen";

const EventsListScreen = () => {
  const {
    events,
    isLoading,
    refreshing,
    currentUserId,
    selectedEvent,
    invitationModalVisible,
    filtersVisible,
    draftFilters,
    filtersActive,
    sortDirection,
    onRefresh,
    handleEventShare,
    handleCloseInvitationModal,
    handleOpenFilters,
    handleCloseFilters,
    handleChangeFilterRole,
    handleChangeFilterDateFrom,
    handleChangeFilterDateTo,
    handleResetFilters,
    handleApplyFilters,
    handleToggleSort,
  } = useEventsListScreen();

  return (
    <ThemedView className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl testID="events-list-refresh" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="gap-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <EventsListFiltersButton active={filtersActive} onPress={handleOpenFilters} />
            <EventsListSortButton direction={sortDirection} onPress={handleToggleSort} />
          </View>
          <EventsList
            isLoading={isLoading}
            events={events}
            onEventShare={handleEventShare}
            currentUserId={currentUserId}
          />
        </View>
      </ScrollView>

      <EventsListFiltersSheet
        visible={filtersVisible}
        draft={draftFilters}
        onClose={handleCloseFilters}
        onChangeRole={handleChangeFilterRole}
        onChangeDateFrom={handleChangeFilterDateFrom}
        onChangeDateTo={handleChangeFilterDateTo}
        onReset={handleResetFilters}
        onApply={handleApplyFilters}
      />

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
