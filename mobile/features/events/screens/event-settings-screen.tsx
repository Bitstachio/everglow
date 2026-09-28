import { H3 } from "@/components/ui/heading";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { SettingsRow } from "@/components/ui/settings-row";
import { Spinner } from "@/components/ui/spinner";
import { ScrollView, View } from "react-native";
import { useEventSettingsScreen } from "../hooks/use-event-settings-screen";

const EventSettingsScreen = () => {
  const {
    event,
    isLoading,
    isDeleting,
    dateSummary,
    handleOpenTitle,
    handleOpenDescription,
    handleOpenDate,
    handleDeleteEvent,
  } = useEventSettingsScreen();

  if (isLoading || !event) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner label="Loading event settings" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 pt-4 pb-6">
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <SettingsRow
            title="Title"
            description={event.title}
            icon="text-outline"
            onPress={handleOpenTitle}
            disabled={isDeleting}
          />
          <View className="h-px bg-border" />
          <SettingsRow
            title="Description"
            description={event.description?.trim() ? event.description : "Not set"}
            icon="document-text-outline"
            onPress={handleOpenDescription}
            disabled={isDeleting}
          />
          <View className="h-px bg-border" />
          <SettingsRow
            title="Date & Time"
            description={dateSummary}
            icon="calendar-outline"
            onPress={handleOpenDate}
            disabled={isDeleting}
          />
        </View>

        <View className="gap-3">
          <H3>Danger Zone</H3>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow
              title={isDeleting ? "Deleting event…" : "Delete Event"}
              description="Permanently delete this event and all of its photos. This cannot be undone."
              icon="trash-outline"
              onPress={handleDeleteEvent}
              destructive
              disabled={isDeleting}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default EventSettingsScreen;
