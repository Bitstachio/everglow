import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { EdgePrint } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { FilmStrip, type StripFrame } from "@/components/ui/film-strip";
import { IconButton } from "@/components/ui/icon-button";
import { PencilNote } from "@/components/ui/pencil-note";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { QrCode } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { JoinEventSheet } from "../components/join-event-sheet";
import { RollCard } from "../components/roll-card";
import { useEventsScreen } from "../hooks/use-events-screen";

const UNEXPOSED: StripFrame[] = [1, 2, 3, 4].map((n) => ({ key: String(n), number: n }));

const RollSkeleton = () => (
  <View className="gap-2.5">
    <View className="mx-5 h-6 w-48 rounded-xs bg-sheet" />
    <FilmStrip frames={UNEXPOSED} />
    <View className="mx-5 h-2.5 w-36 rounded-xs bg-sheet" />
  </View>
);

const EventsScreen = () => {
  const { t } = useTranslation("home");
  const {
    groups,
    hasRolls,
    isLoading,
    isRefreshing,
    isOffline,
    savedAtLabel,
    profileAvatar,
    joinSheetVisible,
    form,
    onSubmit,
    onScanViaSheet,
    onRefresh,
    onNewEvent,
    onScan,
    onOpenRoll,
    onOpenCard,
    onCloseJoinSheet,
  } = useEventsScreen();

  const showFirstRun = !isLoading && !hasRolls && !isOffline;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="h-11 flex-row items-center justify-between px-5">
        <Wordmark />
        <View className="flex-row items-center gap-3">
          <IconButton accessibilityLabel={t("header.scanner")} onPress={onScan}>
            <AppIcon icon={QrCode} className="text-text" />
          </IconButton>
          <Pressable
            testID="events-profile-button"
            accessibilityRole="button"
            accessibilityLabel={t("header.labCard")}
            onPress={onOpenCard}
          >
            <Avatar {...profileAvatar} size="header" />
          </Pressable>
        </View>
      </View>

      {isOffline ? (
        <View className="mt-3 flex-row items-center justify-between border-y border-line px-5 py-2">
          <EdgePrint tone="text">{t("offline.edge")}</EdgePrint>
          <EdgePrint>
            {savedAtLabel ? `${t("offline.note")} · ${t("offline.asOf", { time: savedAtLabel })}` : t("offline.note")}
          </EdgePrint>
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6 pt-6"
        refreshControl={<RefreshControl testID="home-refresh" refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {isLoading ? (
          <View testID="home-loading" className="gap-5.5">
            <RollSkeleton />
            <RollSkeleton />
            <RollSkeleton />
          </View>
        ) : showFirstRun ? (
          <View className="gap-4">
            <FilmStrip frames={UNEXPOSED} />
            <View className="px-5">
              <EdgePrint className="mb-3">{t("firstRun.edge")}</EdgePrint>
              <Display>{t("firstRun.title")}</Display>
              <Text className="mt-3 font-sans text-body text-text-2">{t("firstRun.body")}</Text>
              <PencilNote className="mt-4 self-start -rotate-3">{t("firstRun.note")}</PencilNote>
            </View>
          </View>
        ) : (
          <View className="gap-5.5">
            {groups.live.map((event) => (
              <RollCard key={event.id} event={event} onPress={() => onOpenRoll(event)} />
            ))}
            {groups.upcoming.map((event) => (
              <RollCard key={event.id} event={event} onPress={() => onOpenRoll(event)} />
            ))}
            {groups.closed.length > 0 ? (
              <View className="mt-1.5 flex-row items-center justify-between border-t-2 border-text px-5 pt-2.5">
                <EdgePrint tone="text">{t("closed.heading", { count: groups.closed.length })}</EdgePrint>
                <EdgePrint>{t("closed.note")}</EdgePrint>
              </View>
            ) : null}
            {groups.closed.map((event) => (
              <RollCard key={event.id} event={event} onPress={() => onOpenRoll(event)} />
            ))}
          </View>
        )}
      </ScrollView>

      <View className="gap-3 px-5 pb-1">
        {showFirstRun ? (
          <>
            <Button title={t("firstRun.startRoll")} mark="+" onPress={onNewEvent} />
            <Button title={t("firstRun.joinEnvelope")} variant="secondary" mark="▸" onPress={onScan} />
          </>
        ) : (
          <>
            <Button title={t("newEvent")} mark="+" onPress={onNewEvent} disabled={isOffline} />
            {isOffline ? <EdgePrint className="self-center">{t("offline.waiting")}</EdgePrint> : null}
          </>
        )}
      </View>

      <FilmGrain />

      <JoinEventSheet
        visible={joinSheetVisible}
        onClose={onCloseJoinSheet}
        control={form.control}
        isSubmitting={form.formState.isSubmitting}
        onSubmit={onSubmit}
        onScan={onScanViaSheet}
      />
    </SafeAreaView>
  );
};

export default EventsScreen;
