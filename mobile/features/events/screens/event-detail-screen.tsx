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
import { UnexposedRoll } from "../components/unexposed-roll";
import { useEventDetailScreen } from "../hooks/use-event-detail-screen";
import { closedOn, formatEnvelopeDay } from "../lib/envelope";
import {
  bandStock,
  bandTime,
  formatOpensAt,
  formatRange,
  formatRollDate,
  hostName,
  storagePair,
  type Duration,
  type SheetFrame,
} from "../lib/roll-page";
import { formatClosedOn, formatOpensOn } from "../lib/rolls";
import { formatStorageBytes } from "../utils";

// Room under the sheet so the last row clears the shutter.
const FOOT_SPACE = 190;

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
  const upload = screen.uploadStatus;
  const progress = !upload
    ? undefined
    : upload.phase === "preparing"
      ? t("footer.preparing")
      : t("footer.developing", { done: upload.done, total: upload.total });

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
        return {
          kind: "shutter",
          shutterLabel: progress ?? t("footer.addPhotos"),
          progress,
          busy: upload !== null,
          onShutter: screen.onAddPhotos,
          save,
          right: role === "host" ? invite : people,
          circled: (stage === "empty" || lastDay) && upload === null,
          note: stage === "empty" && upload === null ? t("footer.firstShot") : undefined,
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

  const renderFrame = ({ item }: { item: SheetFrame }) => (
    <View className="w-1/3 px-0.5 pb-3.5">
      <ContactFrame
        uri={item.photo.thumbnailUrl}
        cacheKey={`photo:${item.photo.id}:thumbnail`}
        number={item.number}
        by={item.by ?? undefined}
        isNew={item.isNew}
        accessibilityLabel={frameLabel(item)}
        onPress={() => screen.onOpenFrame(item)}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-ground">
      <FlatList
        testID="roll-sheet"
        data={showsSheet ? frames : []}
        keyExtractor={(frame) => frame.photo.id}
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

  return (
    <>
      <BottomSheet visible={screen.sheet !== null} onClose={screen.onCloseSheet}>
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

export default EventDetailScreen;
