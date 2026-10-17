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
import { colorTokens } from "@/theme/tokens";
import { QrCode } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { JoinEventSheet } from "../components/join-event-sheet";
import { RollCard } from "../components/roll-card";
import { useEventsScreen } from "../hooks/use-events-screen";
import { useRollPreview } from "../hooks/use-roll-preview";
import type { Event } from "../types";

const UNEXPOSED: StripFrame[] = [1, 2, 3, 4].map((n) => ({ key: String(n), number: n }));

// First run: the first frame is circled for the roll they are about to start.
const FIRST_ROLL: StripFrame[] = UNEXPOSED.map((frame, i) => (i === 0 ? { ...frame, circled: true } : frame));

/** An open roll loads its first photos for the strip; the rest wait on the events list. */
type LiveRollCardProps = { event: Event; now: Date; savedAt: string | null; onPress: () => void };

const LiveRollCard = ({ event, now, savedAt, onPress }: LiveRollCardProps) => {
  const photos = useRollPreview(event);
  return <RollCard event={event} now={now} savedAt={savedAt} onPress={onPress} photos={photos} />;
};

// While loading, the frames are blank: no numbers until the rolls arrive (03.2).
const LOADING: StripFrame[] = [1, 2, 3, 4].map((n) => ({ key: String(n) }));

const RollSkeleton = () => (
  <View className="gap-2.5">
    <View className="mx-5 h-5.5 w-50 rounded-xs bg-sheet" />
    <FilmStrip frames={LOADING} />
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
    now,
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
  // Offline, each roll says when it was last loaded (03.5).
  const offlineAsOf = isOffline ? savedAtLabel : null;

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <View className="h-11 flex-row items-center justify-between px-5">
        <Wordmark />
        <View className="flex-row items-center gap-3">
          <IconButton accessibilityLabel={t("header.scanner")} onPress={onScan}>
            <AppIcon icon={QrCode} size="sm" color={colorTokens.text} />
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
        <View className="mx-5 mb-3 mt-2.5 flex-row items-center justify-between border-b border-t border-outline-soft py-2">
          <EdgePrint tone="text">{t("offline.edge")}</EdgePrint>
          <EdgePrint>{hasRolls ? t("offline.note") : t("offline.nothingSaved")}</EdgePrint>
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6 pt-3.5"
        refreshControl={<RefreshControl testID="home-refresh" refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {isLoading ? (
          <View testID="home-loading" className="gap-5.5">
            <RollSkeleton />
            <RollSkeleton />
            <RollSkeleton />
          </View>
        ) : showFirstRun ? (
          <View className="mt-9.5">
            <FilmStrip frames={FIRST_ROLL} />
            <View className="-mt-1 ml-34 self-start -rotate-4">
              <PencilNote>{t("firstRun.note")}</PencilNote>
            </View>
            <View className="mt-6 px-5">
              <EdgePrint className="mb-3">{t("firstRun.edge")}</EdgePrint>
              <Display dim={t("firstRun.body")}>{t("firstRun.title")}</Display>
            </View>
          </View>
        ) : (
          <View className="gap-5.5">
            {groups.live.map((event) => (
              <LiveRollCard
                key={event.id}
                event={event}
                now={now}
                savedAt={offlineAsOf}
                onPress={() => onOpenRoll(event)}
              />
            ))}
            {groups.upcoming.map((event) => (
              <RollCard
                key={event.id}
                event={event}
                now={now}
                savedAt={offlineAsOf}
                onPress={() => onOpenRoll(event)}
              />
            ))}
            {groups.closed.length > 0 ? (
              <View className="mx-5 mb-1.5 mt-7.75 flex-row items-center justify-between border-t-2 border-text pt-2.5">
                <EdgePrint tone="text">{t("closed.heading", { count: groups.closed.length })}</EdgePrint>
                <EdgePrint>{t("closed.note")}</EdgePrint>
              </View>
            ) : null}
            {groups.closed.map((event) => (
              <RollCard
                key={event.id}
                event={event}
                now={now}
                savedAt={offlineAsOf}
                onPress={() => onOpenRoll(event)}
              />
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
        startOnScanner
      />
    </SafeAreaView>
  );
};

export default EventsScreen;
