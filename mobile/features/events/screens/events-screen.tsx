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
import { type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { Easing, FadeOut, LinearTransition } from "react-native-reanimated";
import { HomeEventCard } from "../components/home-event-card";
import { HomeEventsFilterButton } from "../components/home-events-filter-button";
import { useEventsScreen } from "../hooks/use-events-screen";
import { LEAVE_MOTION } from "../lib/left-roll";
import type { Event } from "../types";

const UNEXPOSED: StripFrame[] = [1, 2, 3, 4].map((n) => ({ key: String(n), number: n }));

// First run: the first frame is circled for the roll they are about to start.
const FIRST_ROLL: StripFrame[] = UNEXPOSED.map((frame, i) => (i === 0 ? { ...frame, circled: true } : frame));

// 13.3: the roll you left fades, then the cards below close the gap.
const LEAVE_FADE = FadeOut.duration(LEAVE_MOTION.fadeMs).easing(Easing.out(Easing.quad));
const CLOSE_UP = LinearTransition.duration(LEAVE_MOTION.slideMs)
  .delay(LEAVE_MOTION.slideDelayMs)
  .easing(Easing.out(Easing.cubic));

/** One row of the list. It only moves while the roll you left goes; any other change to the list is instant. */
const ListRow = ({ moving, children }: { moving: boolean; children: ReactNode }) => (
  <Animated.View layout={moving ? CLOSE_UP : undefined} exiting={moving ? LEAVE_FADE : undefined}>
    {children}
  </Animated.View>
);

// While loading, each event is a blank card until the list arrives.
const CardSkeleton = () => <View className="mx-5 h-36 rounded-paper bg-sheet" />;

const EventsScreen = () => {
  const { t } = useTranslation("home");
  const {
    groups,
    leavingRoll,
    hasRolls,
    isLoading,
    isRefreshing,
    isOffline,
    savedAtLabel,
    now,
    profileAvatar,
    onRefresh,
    onNewEvent,
    onScan,
    onOpenRoll,
    onOpenCard,
  } = useEventsScreen();

  const showFirstRun = !isLoading && !hasRolls && !isOffline;
  const moving = leavingRoll !== null;
  // The roll you left can't be opened while it goes.
  const openRoll = (event: Event) => (event.id === leavingRoll?.id ? undefined : () => onOpenRoll(event));
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

      {hasRolls ? (
        <View className="flex-row items-center justify-end px-5 pb-2 pt-1">
          <HomeEventsFilterButton onPress={() => {}} />
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6 pt-3.5"
        refreshControl={<RefreshControl testID="home-refresh" refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {isLoading ? (
          <View testID="home-loading" className="gap-5.5">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
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
              <ListRow key={event.id} moving={moving}>
                <HomeEventCard event={event} now={now} savedAt={offlineAsOf} onPress={openRoll(event)} />
              </ListRow>
            ))}
            {groups.upcoming.map((event) => (
              <ListRow key={event.id} moving={moving}>
                <HomeEventCard event={event} now={now} savedAt={offlineAsOf} onPress={openRoll(event)} />
              </ListRow>
            ))}
            {groups.closed.length > 0 ? (
              <ListRow key="closed-heading" moving={moving}>
                <View className="mx-5 mb-1.5 mt-7.75 flex-row items-center justify-between border-t-2 border-text pt-2.5">
                  <EdgePrint tone="text">{t("closed.heading", { count: groups.closed.length })}</EdgePrint>
                  <EdgePrint>{t("closed.note")}</EdgePrint>
                </View>
              </ListRow>
            ) : null}
            {groups.closed.map((event) => (
              <ListRow key={event.id} moving={moving}>
                <HomeEventCard event={event} now={now} savedAt={offlineAsOf} onPress={openRoll(event)} />
              </ListRow>
            ))}
          </View>
        )}
      </ScrollView>

      <View className="gap-3 px-5 pb-1">
        {showFirstRun ? (
          <>
            <Button testID="home-new-roll" title={t("firstRun.startEvent")} mark="+" onPress={onNewEvent} />
            <Button title={t("firstRun.joinEnvelope")} variant="secondary" mark="▸" onPress={onScan} />
          </>
        ) : (
          <>
            <Button testID="home-new-roll" title={t("newEvent")} mark="+" onPress={onNewEvent} disabled={isOffline} />
            {isOffline ? <EdgePrint className="self-center">{t("offline.waiting")}</EdgePrint> : null}
          </>
        )}
      </View>

      <FilmGrain />
    </SafeAreaView>
  );
};

export default EventsScreen;
