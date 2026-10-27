import { AppIcon } from "@/components/ui/app-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ContactFrame } from "@/components/ui/contact-frame";
import { Display } from "@/components/ui/display";
import { EdgePrint, EdgeValue } from "@/components/ui/edge-print";
import { FilmGrain } from "@/components/ui/film-grain";
import { IconButton } from "@/components/ui/icon-button";
import { IndexRow } from "@/components/ui/index-row";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Slip } from "@/components/ui/slip";
import { Spinner } from "@/components/ui/spinner";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import { colorTokens } from "@/theme/tokens";
import { DotsThree } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrivalNote } from "../components/arrival-note";
import { FrameViewer } from "../components/frame-viewer";
import { RollBand } from "../components/roll-band";
import { RollCover } from "../components/roll-cover";
import { RollFooter, type FooterAction, type RollFooterProps } from "../components/roll-footer";
import { RollNotice } from "../components/roll-notice";
import { RollOpened } from "../components/roll-opened";
import { RollPeopleList } from "../components/roll-people-list";
import { RollTrayLine } from "../components/roll-tray-line";
import { UnexposedRoll } from "../components/unexposed-roll";
import { useEventDetailScreen } from "../hooks/use-event-detail-screen";
import { closedOn, formatEnvelopeDay } from "../lib/envelope";
import {
  bandStock,
  bandTime,
  formatClock,
  formatOpensAt,
  formatRange,
  formatRollDate,
  hostName,
  storagePair,
  type Duration,
  type SheetFrame,
} from "../lib/roll-page";
import { formatClosedOn, formatOpensOn } from "../lib/rolls";
import type { DevelopingFrame } from "../lib/upload-tray";
import { formatEventStorage, formatStorageBytes } from "../utils";

// Room under the sheet so the last row clears the shutter.
const FOOT_SPACE = 190;

/** A frame on the sheet: one on the roll, or one still developing from the tray. */
type SheetItem = { kind: "photo"; frame: SheetFrame } | { kind: "developing"; frame: DevelopingFrame };

const value = <EdgeValue>{null}</EdgeValue>;

/** A round button over the cover, darkened so it reads on any photo. */
const CoverButton = ({ children }: { children: ReactNode }) => (
  <View className="rounded-full bg-scrim">{children}</View>
);

const EventDetailScreen = () => {
  const { t } = useTranslation(["roll", "common"]);
  const insets = useSafeAreaInsets();
  const screen = useEventDetailScreen();
  const { event, participants, frames, role, stage, now, lastDay } = screen;

  if (screen.isLoading || !event) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <Spinner size="large" label={t("common:actions.loading")} />
      </View>
    );
  }

  const host = hostName(event, participants);
  const count = frames.length;

  if (screen.openedVisible) {
    const opens = formatRollDate(event.galleryOpensAt);
    return (
      <RollOpened
        title={event.title}
        isOpenLine={t("opened.isOpen")}
        edge={
          event.galleryClosesAt
            ? t("opened.edge", {
                opens: formatOpensAt(event.galleryOpensAt),
                closes: formatRollDate(event.galleryClosesAt),
                count: event.usage.members,
              })
            : t("opened.edgeOpenEnded", { opens, count: event.usage.members })
        }
        count={count}
        counterLabel={t("opened.counter")}
        counterAccessibilityLabel={t("opened.counterLabel", { count })}
        backLabel={t("common:actions.back")}
        action={
          role === "viewer"
            ? { title: t("opened.look"), mark: "▸", onPress: screen.onDismissOpened }
            : { title: t("opened.addFirst"), mark: "+", onPress: screen.onAddFirstPhotos }
        }
        onBack={screen.onDismissOpened}
      />
    );
  }

  const describe = (duration: Duration) =>
    duration.kind === "days"
      ? t("duration.days", { count: duration.days })
      : duration.hours > 0
        ? t("duration.hoursMinutes", { hours: duration.hours, minutes: duration.minutes })
        : t("duration.minutes", { minutes: duration.minutes });

  // 07.9 Closed: the photos are gone; the roll and its people stay.
  if (stage === "closed") {
    const removedOn = closedOn(event);
    return (
      <SafeAreaView className="flex-1 bg-ground">
        <TopBar
          title={t("closed.top", { date: formatClosedOn(removedOn) })}
          left={<BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />}
          right={
            <IconButton accessibilityLabel={t("menu")} onPress={screen.onOpenMenu}>
              <AppIcon icon={DotsThree} size="sm" color={colorTokens.text} />
            </IconButton>
          }
        />
        <FlatList
          data={participants}
          keyExtractor={(participant) => participant.userId}
          refreshControl={
            <RefreshControl testID="event-detail-refresh" refreshing={screen.refreshing} onRefresh={screen.onRefresh} />
          }
          ListHeaderComponent={
            <View>
              <View className="px-5 pt-6">
                <Display className="text-text-2">{event.title}</Display>
                <EdgePrint className="mt-2.5">
                  {t("closed.edge", {
                    range: formatRange(event.galleryOpensAt, removedOn),
                    count: event.usage.members,
                  })}
                </EdgePrint>
              </View>
              <UnexposedRoll
                strips={3}
                crossed
                note={t("closed.removed", { date: formatEnvelopeDay(removedOn) })}
                accessibilityLabel={t("closed.removedLabel", { date: formatEnvelopeDay(removedOn) })}
              />
              <EdgePrint className="mx-5 mt-8 border-b border-outline-soft pb-2.5">
                {t("closed.whoWasThere", { count: participants.length })}
              </EdgePrint>
            </View>
          }
          renderItem={({ item }) => (
            <View className="mx-5 min-h-12 flex-row items-center justify-between border-b border-line py-3">
              <Text className="font-sans-medium text-name text-text" numberOfLines={1}>
                {item.name}
              </Text>
              {item.accessLevel === "ORGANIZER" ? <EdgePrint>{t("closed.host")}</EdgePrint> : null}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
        {screen.arrivalNote ? (
          <View pointerEvents="none" className="absolute bottom-8 left-5 right-5">
            <ArrivalNote label={screen.arrivalNote} />
          </View>
        ) : null}
        <Sheets screen={screen} />
        <FilmGrain />
      </SafeAreaView>
    );
  }

  const time = bandTime(event, now);
  const stock = bandStock(stage, role);
  const used = formatStorageBytes(Number(event.usage.storageBytes));

  const stockText =
    stock.kind === "hidden" ? (
      t("band.hidden")
    ) : stock.kind === "frames" ? (
      <Trans t={t} i18nKey="band.frames" values={{ count }} components={{ value }} />
    ) : event.limits.storageBytes === null ? (
      <Trans t={t} i18nKey="band.storageNoLimit" values={{ used }} components={{ value }} />
    ) : (
      <Trans
        t={t}
        i18nKey="band.storage"
        values={storagePair(Number(event.usage.storageBytes), Number(event.limits.storageBytes))}
        components={{ value }}
      />
    );

  const viewOnlyBand = role === "viewer" && stage !== "suspended";

  const timeText =
    time.kind === "opensIn" ? (
      <Trans t={t} i18nKey="band.opensIn" values={{ time: describe(time.duration) }} components={{ value }} />
    ) : time.kind === "left" ? (
      <Trans t={t} i18nKey="band.left" values={{ time: describe(time.duration) }} components={{ value }} />
    ) : (
      t(`band.${time.kind}`)
    );

  const sub =
    stage === "upcoming"
      ? role === "host"
        ? event.galleryWindowDays
          ? t("sub.upcomingHost", { when: formatOpensAt(event.galleryOpensAt), days: event.galleryWindowDays })
          : t("sub.upcomingHostOpenEnded", { when: formatOpensAt(event.galleryOpensAt) })
        : host
          ? t("sub.upcomingGuest", { when: formatOpensAt(event.galleryOpensAt), host })
          : t("sub.upcomingHostOpenEnded", { when: formatOpensAt(event.galleryOpensAt) })
      : stage === "suspended"
        ? host
          ? t("sub.hidden", { date: formatRollDate(event.date), host })
          : t("sub.hiddenNoHost", { date: formatRollDate(event.date) })
        : host
          ? t("sub.open", { date: formatRollDate(event.date), host, count })
          : t("sub.openNoHost", { date: formatRollDate(event.date), count });

  const save: FooterAction = {
    title: screen.saving
      ? t("footer.saving", { done: screen.saving.done, total: screen.saving.total })
      : t("footer.saveAll"),
    accessibilityLabel: t("footer.saveAllLabel"),
    onPress: screen.onSaveAll,
    disabled: count === 0 || screen.saving !== null,
  };
  const people: FooterAction = {
    title: t("footer.people"),
    accessibilityLabel: t("footer.peopleLabel"),
    onPress: screen.onOpenPeople,
  };
  const invite: FooterAction = {
    title: t("footer.invite"),
    accessibilityLabel: t("footer.inviteLabel"),
    onPress: screen.onOpenEnvelope,
  };
  const moreRoom: FooterAction = {
    title: t("footer.moreRoom"),
    accessibilityLabel: t("footer.moreRoomLabel"),
    onPress: screen.onOpenSettings,
  };

  const footer: RollFooterProps = (() => {
    switch (stage) {
      case "upcoming":
        return role === "host"
          ? { kind: "leader", title: t("footer.sendEnvelope"), mark: "↗", onPress: screen.onOpenEnvelope }
          : {
              kind: "locked",
              label: t("footer.opensAt", { when: formatOpensOn(event.galleryOpensAt) }),
              accessibilityLabel: t("footer.lockedLabel", { when: formatOpensOn(event.galleryOpensAt) }),
            };
      case "underReview":
        return { kind: "locked", label: t("footer.onHold"), accessibilityLabel: t("footer.onHold"), save };
      case "suspended":
        return role === "host"
          ? {
              kind: "text",
              action: { title: t("footer.cut"), accessibilityLabel: t("footer.cutLabel"), onPress: screen.onCut },
            }
          : { kind: "none" };
      default:
        if (role === "viewer") return { kind: "viewOnly", note: t("footer.viewOnly"), save, right: people };
        // 08.7: at the limit the shutter locks for everyone. Hosts can make room; guests are told who to ask.
        if (screen.isFull) {
          const label =
            role === "host" ? t("footer.full") : host ? t("footer.fullGuest", { host }) : t("footer.fullGuestNoHost");
          return {
            kind: "locked",
            label,
            accessibilityLabel: t("footer.fullLabel"),
            save,
            right: role === "host" ? moreRoom : people,
          };
        }
        return {
          kind: "shutter",
          shutterLabel: screen.preparing ? t("footer.preparing") : t("footer.addPhotos"),
          progress: screen.preparing ? t("footer.preparing") : undefined,
          busy: screen.preparing,
          onShutter: screen.onAddPhotos,
          save,
          right: role === "host" ? invite : people,
          circled: (stage === "empty" || lastDay) && !screen.preparing,
          note: stage === "empty" && !screen.preparing ? t("footer.firstShot") : undefined,
        };
    }
  })();

  const showsSheet = stage === "open" || stage === "underReview";

  const header = (
    <View>
      <RollCover
        eventId={event.id}
        uri={stage === "suspended" ? null : event.coverUrl}
        title={event.title}
        sub={sub}
        dim={stage === "upcoming"}
      />
      <RollBand
        stock={stockText}
        time={timeText}
        // View-only guests see their role where the people count goes; People is in their footer (07.7).
        people={
          viewOnlyBand ? (
            t("band.viewOnly")
          ) : (
            <Trans t={t} i18nKey="band.people" values={{ count: event.usage.members }} components={{ value }} />
          )
        }
        peopleLabel={viewOnlyBand ? t("band.viewOnly") : t("band.peopleLabel", { count: event.usage.members })}
        onPeople={viewOnlyBand ? undefined : screen.onOpenPeople}
        circleTime={(stage === "upcoming" && role === "host") || lastDay}
        circleStock={screen.isFull}
      />
      {stage === "underReview" ? <RollNotice edge={t("notice.reviewEdge")} body={t("notice.reviewBody")} /> : null}
      {stage === "suspended" ? (
        <RollNotice
          pencil
          edge={t("notice.suspendedEdge")}
          body={t("notice.suspendedBody")}
          more={{ title: t("notice.whatThisMeans"), onPress: screen.onOpenRules }}
        />
      ) : null}
      {stage === "upcoming" || stage === "suspended" ? <UnexposedRoll strips={2} /> : null}
      {stage === "empty" ? <UnexposedRoll strips={1} /> : null}
      {showsSheet ? <View className="h-4" /> : null}
    </View>
  );

  const frameLabel = (frame: SheetFrame) => {
    const label = frame.by
      ? t("frame.labelBy", { number: frame.number, name: frame.by })
      : t("frame.label", { number: frame.number });
    return frame.isNew ? t("frame.new", { label }) : label;
  };

  const renderFrame = ({ item }: { item: SheetItem }) => (
    <View className="w-1/3 px-0.5 pb-3.5">
      {item.kind === "photo" ? (
        <ContactFrame
          uri={item.frame.photo.url}
          placeholderUri={screen.localFileFor(item.frame.photo.id)}
          number={item.frame.number}
          by={item.frame.by ?? undefined}
          isNew={item.frame.isNew}
          accessibilityLabel={frameLabel(item.frame)}
          onPress={() => screen.onOpenFrame(item.frame)}
        />
      ) : (
        <ContactFrame
          uri={item.frame.item.uri}
          number={item.frame.number}
          by={t("frame.you")}
          develop={item.frame.develop}
          crossed={item.frame.crossed}
          accessibilityLabel={
            item.frame.crossed
              ? t("tray.frameFailed", { number: item.frame.number })
              : t("tray.frameDeveloping", { number: item.frame.number })
          }
          onPress={screen.onOpenTray}
        />
      )}
    </View>
  );

  const sheetItems: SheetItem[] = showsSheet
    ? [
        ...screen.developing.map((frame) => ({ kind: "developing" as const, frame })),
        ...frames.map((frame) => ({ kind: "photo" as const, frame })),
      ]
    : [];

  // 08.2 / 08.4: one line over the shutter while the tray has something to say.
  const trayLine = (() => {
    const tray = screen.tray;
    const open: FooterAction = {
      title: t("tray.line.open"),
      accessibilityLabel: t("tray.line.openLabel"),
      onPress: screen.onOpenTray,
    };
    if (tray.inFlight > 0) {
      return {
        text: t("tray.line.developing", { current: Math.min(tray.developed + 1, tray.sendable), total: tray.sendable }),
        action: open,
      };
    }
    if (tray.retryable > 0) {
      return {
        text:
          tray.offline === tray.retryable
            ? t("tray.line.offline", { count: tray.retryable })
            : t("tray.line.didntTake", { count: tray.retryable }),
        action: { title: t("tray.line.retry"), accessibilityLabel: t("tray.line.retryLabel"), onPress: screen.onRetry },
      };
    }
    if (tray.noRoom > 0) return { text: t("tray.line.noRoom", { count: tray.noRoom }), action: open };
    if (tray.rejected > 0) return { text: t("tray.line.cantAdd", { count: tray.rejected }), action: open };
    return null;
  })();

  return (
    <View className="flex-1 bg-ground">
      <FlatList
        testID="roll-sheet"
        data={sheetItems}
        keyExtractor={(item) => (item.kind === "photo" ? item.frame.photo.id : item.frame.item.key)}
        numColumns={3}
        renderItem={renderFrame}
        ListHeaderComponent={header}
        columnWrapperClassName="px-0.5"
        contentContainerStyle={{ paddingBottom: FOOT_SPACE + insets.bottom }}
        refreshControl={
          <RefreshControl testID="event-detail-refresh" refreshing={screen.refreshing} onRefresh={screen.onRefresh} />
        }
      />

      <View className="absolute left-0 right-0 flex-row justify-between px-5" style={{ top: insets.top + 8 }}>
        <CoverButton>
          <BackButton accessibilityLabel={t("common:actions.back")} onPress={screen.onBack} />
        </CoverButton>
        <CoverButton>
          <IconButton accessibilityLabel={t("menu")} onPress={screen.onOpenMenu}>
            <AppIcon icon={DotsThree} size="sm" color={colorTokens.text} />
          </IconButton>
        </CoverButton>
      </View>

      <RollFooter {...footer} bottomInset={insets.bottom} />

      {trayLine && !screen.notice ? (
        <View className="absolute left-0 right-0" style={{ bottom: insets.bottom + FOOT_SPACE - 52 }}>
          <RollTrayLine text={trayLine.text} action={trayLine.action} />
        </View>
      ) : null}

      {screen.notice ? (
        <View
          pointerEvents="none"
          className="absolute left-5 right-5 items-center"
          style={{ bottom: insets.bottom + FOOT_SPACE - 40 }}
        >
          <EdgePrint accessibilityLiveRegion="polite" tone="text" className="bg-sheet px-3 py-2 text-center">
            {screen.notice}
          </EdgePrint>
        </View>
      ) : null}

      {screen.arrivalNote ? (
        // At the foot of the roll, over the controls, as drawn (06.7).
        <View
          pointerEvents="none"
          className="absolute left-5 right-5"
          style={{ bottom: insets.bottom + FOOT_SPACE - 40 }}
        >
          <ArrivalNote label={screen.arrivalNote} />
        </View>
      ) : null}

      <FilmGrain />
      <Sheets screen={screen} />
    </View>
  );
};

/** Everything that opens over the roll: the menu, people, slips, the envelope, a frame. */
const Sheets = ({ screen }: { screen: ReturnType<typeof useEventDetailScreen> }) => {
  const { t } = useTranslation("roll");
  const { event, role } = screen;
  if (!event) return null;

  const host = hostName(event, screen.participants);
  const closed = screen.closedWhileSending;
  const room = screen.roomCheck;

  return (
    <>
      <BottomSheet visible={screen.sheet !== null} onClose={screen.onCloseSheet} onClosed={screen.onSheetClosed}>
        {screen.sheet === "closedSending" && closed ? (
          // 08.8: the gallery closed while photos were sending. There's no Retry.
          <Slip
            edge={t("closedSending.edge", {
              time: formatClock(event.galleryState === "CLOSED" ? closedOn(event) : closed.at),
            })}
            title={t("closedSending.title", { count: screen.tray.closed })}
            body={closed.landed > 0 ? t("closedSending.body", { count: closed.landed }) : t("closedSending.bodyNone")}
          >
            <Button title={t("closedSending.ok")} mark="✓" onPress={screen.onDismissClosed} />
          </Slip>
        ) : null}

        {screen.sheet === "menu" ? (
          <View>
            <IndexRow label={t("menuSheet.people")} onPress={screen.onOpenPeople} />
            {role === "host" && event.status !== "SUSPENDED" ? (
              <IndexRow label={t("menuSheet.settings")} onPress={screen.onOpenSettings} />
            ) : null}
            {role !== "host" ? <IndexRow action muted label={t("menuSheet.leave")} onPress={screen.onLeave} /> : null}
          </View>
        ) : null}

        {screen.sheet === "people" ? (
          <RollPeopleList
            participants={screen.participants}
            currentUserId={screen.currentUserId}
            onRemove={role === "host" && event.status === "ACTIVE" ? screen.onRemove : undefined}
          />
        ) : null}

        {screen.sheet === "leave" ? (
          <Slip title={t("leave.title", { title: event.title })} body={t("leave.body")}>
            <Button title={t("leave.confirm")} mark="⇥" onPress={screen.onConfirmLeave} isLoading={screen.isLeaving} />
            <Button title={t("leave.cancel")} variant="secondary" mark="‹" onPress={screen.onCloseSheet} />
          </Slip>
        ) : null}

        {screen.sheet === "cut" ? (
          <Slip edge={event.title} title={t("cut.title")} body={t("cut.body")}>
            <Button
              title={t("cut.confirm")}
              variant="danger"
              mark="✂"
              onPress={screen.onConfirmCut}
              isLoading={screen.isCutting}
            />
            <Button title={t("cut.cancel")} variant="secondary" mark="‹" onPress={screen.onCloseSheet} />
          </Slip>
        ) : null}

        {screen.sheet === "room" && room ? (
          // 08.6: not enough room for everything picked.
          <Slip
            edge={formatEventStorage(event)}
            title={
              room.fits.length > 0
                ? t("room.title", { fits: room.fits.length, wanted: room.wanted })
                : t("room.noneTitle")
            }
            body={roomBody(t, room.fits.length, formatStorageBytes(room.leftBytes), role, host)}
          >
            {room.fits.length > 0 ? (
              <Button title={t("room.send", { count: room.fits.length })} mark="▸" onPress={screen.onSendWhatFits} />
            ) : null}
            <Button
              title={t("room.pickAgain")}
              variant={room.fits.length > 0 ? "secondary" : "primary"}
              mark="‹"
              onPress={screen.onPickAgain}
            />
          </Slip>
        ) : null}

        {screen.sheet === "remove" ? (
          <Slip title={t("remove.title", { name: screen.removing?.name ?? "" })} body={t("remove.body")}>
            <Button
              title={t("remove.confirm")}
              variant="danger"
              onPress={screen.onConfirmRemove}
              isLoading={screen.isRemoving}
            />
            <Button title={t("remove.cancel")} variant="secondary" mark="‹" onPress={screen.onBackToPeople} />
          </Slip>
        ) : null}
      </BottomSheet>

      <FrameViewer
        frame={screen.openFrame}
        canDelete={screen.openFrameIsDeletable}
        isSaving={screen.isSavingFrame}
        isDeleting={screen.isDeletingFrame}
        confirmDeleteVisible={screen.confirmDeleteVisible}
        onClose={screen.onCloseFrame}
        onSave={screen.onSaveFrame}
        onDelete={screen.onDeleteFrame}
        onCancelDelete={screen.onCancelDeleteFrame}
        onConfirmDelete={screen.onConfirmDeleteFrame}
      />
    </>
  );
};

/** 08.6's body: who can make room depends on who's asking. */
const roomBody = (
  t: ReturnType<typeof useTranslation<"roll">>["t"],
  fits: number,
  left: string,
  role: string,
  host: string | null,
) => {
  const none = fits === 0;
  if (role === "host") return none ? t("room.noneBodyHost", { left }) : t("room.bodyHost", { left, fits });
  if (host) return none ? t("room.noneBodyGuest", { left, host }) : t("room.bodyGuest", { left, fits, host });
  return none ? t("room.noneBodyGuestNoHost", { left }) : t("room.bodyGuestNoHost", { left, fits });
};

export default EventDetailScreen;
