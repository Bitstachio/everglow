import { ThemedView } from "@/components/themed-view";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { colorTokens } from "@/theme/tokens";
import { ChevronRight, Pencil } from "lucide-react-native";
import { Stack } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditEventModal } from "../components/edit-event-modal";
import { EventDetailInfo } from "../components/event-detail-info";
import { EventMembersSheet } from "../components/event-members-sheet";
import { EventPhotosSection } from "../components/event-photos-section";
import { useEventDetailScreen } from "../hooks/use-event-detail-screen";

const EventDetailScreen = () => {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const {
    event,
    photos,
    participants,
    isLoading,
    refreshing,
    isAdmin,
    currentUserId,
    isUploadingPhoto,
    editModalVisible,
    membersSheetVisible,
    form,
    onSubmit,
    onRefresh,
    handleOpenEdit,
    handleCloseEdit,
    handleUploadImage,
    handleDeleteEvent,
    handleLeaveEvent,
    handleDeletePhoto,
    handleRemoveMember,
    handleDownloadPhoto,
    handleOpenMembers,
    handleCloseMembers,
  } = useEventDetailScreen();

  if (isLoading || !event) {
    return (
      <ThemedView className="flex-1">
        <Stack.Screen options={{ title: "Event Details", headerBackTitle: "Back" }} />
        <View className="flex-1 items-center justify-center">
          <Spinner size="large" label="Loading event" />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView className="flex-1">
      <Stack.Screen
        options={{
          title: "Event Details",
          headerBackTitle: "Back",
          headerRight: () =>
            isAdmin ? (
              <IconButton accessibilityLabel="Edit event" onPress={handleOpenEdit}>
                <AppIcon icon={Pencil} size="sm" className="text-accent" />
              </IconButton>
            ) : null,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pb-6 pt-4"
        refreshControl={
          <RefreshControl
            testID="event-detail-refresh"
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colorTokens[colorScheme].foreground}
          />
        }
      >
        <EventDetailInfo event={event} />

        <EventPhotosSection
          photos={photos}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isUploading={isUploadingPhoto}
          onUpload={handleUploadImage}
          onDownload={handleDownloadPhoto}
          onDelete={handleDeletePhoto}
        />

        {isAdmin ? (
          <View className="flex-row items-center justify-between gap-3">
            <H2 className="flex-1">Members</H2>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View all members, ${participants.length}`}
              onPress={handleOpenMembers}
              className="h-11 flex-row items-center gap-2 rounded-xl bg-surface px-3"
              hitSlop={8}
            >
              <ThemedText className="text-sm font-medium" tone="accent">
                View All ({participants.length})
              </ThemedText>
              <AppIcon icon={ChevronRight} size="xs" className="text-accent" />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-border px-4 pt-3" style={{ paddingBottom: 16 + insets.bottom }}>
        {isAdmin ? (
          <Button title="Delete Event" onPress={handleDeleteEvent} className="bg-danger active:opacity-80" />
        ) : (
          <Button title="Leave Event" onPress={handleLeaveEvent} variant="outline" />
        )}
      </View>

      {isAdmin ? (
        <EventMembersSheet
          visible={membersSheetVisible}
          participants={participants}
          onClose={handleCloseMembers}
          onRemove={handleRemoveMember}
        />
      ) : null}

      {isAdmin ? (
        <EditEventModal
          visible={editModalVisible}
          control={form.control}
          isSubmitting={form.formState.isSubmitting}
          error={form.formState.errors.root?.server?.message}
          onSubmit={onSubmit}
          onClose={handleCloseEdit}
        />
      ) : null}
    </ThemedView>
  );
};

export default EventDetailScreen;
