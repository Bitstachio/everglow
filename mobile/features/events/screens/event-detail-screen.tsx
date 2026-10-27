import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/ui/heading";
import { IconButton } from "@/components/ui/icon-button";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Spinner } from "@/components/ui/spinner";
import { ThemedText } from "@/components/ui/themed-text";
import { colorTokens } from "@/theme/tokens";
import { ChevronRight, Settings } from "lucide-react-native";
import { Stack } from "expo-router";
import { Envelope } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ArrivalNote } from "../components/arrival-note";
import { EventCover } from "../components/event-cover";
import { EventDetailInfo } from "../components/event-detail-info";
import { EventMembersSheet } from "../components/event-members-sheet";
import { EventPhotosSection } from "../components/event-photos-section";
import { useArrivalNote } from "../hooks/use-arrival-note";
import { useEventDetailScreen } from "../hooks/use-event-detail-screen";

const EventDetailScreen = () => {
  const { t } = useTranslation("envelope");
  const {
    event,
    photos,
    participants,
    isLoading,
    refreshing,
    isAdmin,
    currentUserId,
    uploadStatus,
    storageLabel,
    membersSheetVisible,
    onRefresh,
    handleOpenSettings,
    handleOpenEnvelope,
    handleUploadImage,
    handleLeaveEvent,
    handleDeletePhoto,
    handleRemoveMember,
    handleDownloadPhoto,
    handleOpenMembers,
    handleCloseMembers,
  } = useEventDetailScreen();
  const arrivalNote = useArrivalNote();

  if (isLoading || !event) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Event Details", headerBackTitle: "Back" }} />
        <View className="flex-1 items-center justify-center">
          <Spinner size="large" label="Loading event" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Event Details",
          headerBackTitle: "Back",
          headerRight: () =>
            isAdmin ? (
              <View className="flex-row gap-2">
                <IconButton accessibilityLabel={t("open")} onPress={handleOpenEnvelope}>
                  <AppIcon icon={Envelope} size="sm" color={colorTokens.text} />
                </IconButton>
                <IconButton accessibilityLabel="Event settings" onPress={handleOpenSettings}>
                  <AppIcon icon={Settings} size="sm" className="text-accent" />
                </IconButton>
              </View>
            ) : null,
        }}
      />

      <SafeAreaView className="flex-1" edges={["bottom"]}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-4 pt-4 pb-6"
          refreshControl={
            <RefreshControl
              testID="event-detail-refresh"
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colorTokens.foreground}
            />
          }
        >
          <EventCover eventId={event.id} uri={event.coverUrl} className="rounded-2xl" />
          <EventDetailInfo event={event} />

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

          <EventPhotosSection
            photos={photos}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            uploadStatus={uploadStatus}
            storageLabel={storageLabel}
            onUpload={handleUploadImage}
            onDownload={handleDownloadPhoto}
            onDelete={handleDeletePhoto}
          />
        </ScrollView>

        {!isAdmin ? (
          <View className="border-t border-border px-4 pb-4 pt-3">
            <Button title="Leave Event" onPress={handleLeaveEvent} variant="outline" />
          </View>
        ) : null}
      </SafeAreaView>

      {arrivalNote ? (
        <View className="absolute left-4 right-4 top-4">
          <ArrivalNote label={arrivalNote} />
        </View>
      ) : null}

      {isAdmin ? (
        <EventMembersSheet
          visible={membersSheetVisible}
          participants={participants}
          onClose={handleCloseMembers}
          onRemove={handleRemoveMember}
        />
      ) : null}
    </View>
  );
};

export default EventDetailScreen;
