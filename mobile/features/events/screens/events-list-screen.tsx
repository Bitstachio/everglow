import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { EventsList } from "../components/events-list";
import { EventsListFiltersButton } from "../components/events-list-filters-button";
import { EventsListFiltersSheet } from "../components/events-list-filters-sheet/events-list-filters-sheet";
import { EventsListSortButton } from "../components/events-list-sort-button";
import { useEventsListScreen } from "../hooks/use-events-list-screen";

const EventsListScreen = () => {
  const {
    events,
    isLoading,
    refreshing,
    currentUserId,
    filtersVisible,
    draftFilters,
    filtersActive,
    sortDirection,
    onRefresh,
    handleEventShare,
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
    <View className="flex-1 bg-background">
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
            filtersActive={filtersActive}
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
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});

export default EventsListScreen;
