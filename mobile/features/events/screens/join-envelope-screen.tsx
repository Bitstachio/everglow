import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Stamp } from "@/components/ui/stamp";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { RollEnvelope } from "../components/roll-envelope";
import { useJoinEnvelopeScreen, type JoinRefusal } from "../hooks/use-join-envelope-screen";

type RefusalCopy = { stamp: string; stampSub: string; title: string; dim: string; body: string };

type RefusalFacts = { organizer: string | null; memberLimit: number | null; closedOn: string | null };

/** What a returned envelope says (06.8–06.13), and the stamp on it. */
const refusalCopy = (
  t: TFunction<"join">,
  refusal: JoinRefusal,
  { organizer, memberLimit, closedOn }: RefusalFacts,
): RefusalCopy => {
  const returned = t("refused.returned");
  switch (refusal) {
    case "EVENT_MEMBER_LIMIT_REACHED":
      return {
        stamp: returned,
        stampSub: t("refused.full.stamp"),
        title: memberLimit ? t("refused.full.title", { limit: memberLimit }) : t("refused.full.titleNoLimit"),
        dim: memberLimit ? t("refused.full.dim") : t("refused.full.dimNoLimit"),
        body: !memberLimit
          ? t("refused.full.bodyNoLimit")
          : organizer
            ? t("refused.full.body", { organizer, limit: memberLimit })
            : t("refused.full.bodyNoOrganizer", { limit: memberLimit }),
      };
    case "NOT_VALID":
      return {
        stamp: returned,
        stampSub: t("refused.notValid.stamp"),
        title: t("refused.notValid.title"),
        dim: t("refused.notValid.dim"),
        body: t("refused.notValid.body"),
      };
    case "REMOVED_FROM_EVENT":
      return {
        stamp: returned,
        stampSub: t("refused.removed.stamp"),
        title: t("refused.removed.title"),
        dim: t("refused.removed.dim"),
        body: t("refused.removed.body"),
      };
    case "EVENT_GALLERY_CLOSED":
      return {
        stamp: returned,
        stampSub: t("refused.closed.stamp"),
        title: t("refused.closed.title"),
        dim: t("refused.closed.dim"),
        body: closedOn ? t("refused.closed.body", { date: closedOn }) : t("refused.closed.bodyNoDate"),
      };
    case "EVENT_UNDER_REVIEW":
      return {
        stamp: t("refused.onHold.stamp"),
        stampSub: t("refused.onHold.stampSub"),
        title: t("refused.onHold.title"),
        dim: t("refused.onHold.dim"),
        body: t("refused.onHold.body"),
      };
    case "EVENT_SUSPENDED":
      return {
        stamp: returned,
        stampSub: t("refused.suspended.stamp"),
        title: t("refused.suspended.title"),
        dim: t("refused.suspended.dim"),
        body: t("refused.suspended.body"),
      };
    case "ORGANIZER_BLOCKED_BY_CALLER": {
      const name = organizer ?? t("open.theOrganizer");
      return {
        stamp: returned,
        stampSub: t("refused.blocked.stamp"),
        title: t("refused.blocked.title", { organizer: name }),
        dim: t("refused.blocked.dim", { organizer: name }),
        body: t("refused.blocked.body", { organizer: name }),
      };
    }
  }
};

/**
 * 06.4–06.13 The envelope someone opens before joining: whose event it is,
 * when it starts and ends and what it admits, or, returned and dimmed, why
 * it doesn't admit them. Signed out, it's sealed (06.3).
 */
const JoinEnvelopeScreen = () => {
  const { t } = useTranslation("join");
  const {
    status,
    refusal,
    envelope,
    organizer,
    memberLimit,
    closedOn,
    failureMessage,
    isJoining,
    onJoin,
    onUnblockAndJoin,
    isSigningIn,
    onSignIn,
    onRetry,
    onBack,
    onBackToRolls,
    onScanAnother,
  } = useJoinEnvelopeScreen();

  const isViewerEnvelope = envelope?.admits === "viewer";
  const refused = refusal ? refusalCopy(t, refusal, { organizer, memberLimit, closedOn }) : null;
  const organizerName = organizer ?? t("open.theOrganizer");
  const edge = refusal === "NOT_VALID" ? t("refused.edgeNotValid") : refusal ? envelope?.title : undefined;

  if (status === "sealed") {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <View className="h-11 flex-row items-center px-5">
          <Wordmark className="text-paper-ink" />
        </View>
        <View className="flex-1">
          <RollEnvelope
            title=""
            sealed
            stamp={<Stamp title={t("sealed.stamp")} subtitle={t("sealed.stampSub")} />}
            accessibilityLabel={t("sealed.label")}
          />
          <View className="px-5 pb-4">
            <Display variant="slip" dim={t("sealed.dim")} className="text-paper-ink">
              {t("sealed.title")}
            </Display>
            <Text className="mt-2 font-sans text-body text-paper-ink-2">{t("sealed.body")}</Text>
          </View>
        </View>
        <View className="px-5 pb-1">
          <Button title={t("sealed.signIn")} mark="▸" onPress={onSignIn} isLoading={isSigningIn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <TopBar
        tone="paper"
        title={edge}
        left={<BackButton accessibilityLabel={t("open.back")} onPress={onBack} tone="paper" />}
      />

      <View className="flex-1">
        <RollEnvelope
          dimmed={status !== "ready"}
          title={envelope?.title ?? ""}
          startsAt={envelope?.startsAt}
          pickUpBy={envelope?.pickUpBy}
          admits={envelope?.admits ?? (refusal === "NOT_VALID" ? "participant" : undefined)}
          stamp={
            refused ? (
              <Stamp title={refused.stamp} subtitle={refused.stampSub} tone="pencil" />
            ) : status === "ready" ? (
              <Stamp title={t("open.stamp")} subtitle={t("open.stampBy", { organizer: organizerName })} />
            ) : undefined
          }
          accessibilityLabel={envelope ? t("envelope.label", { title: envelope.title }) : t("envelope.labelLoading")}
        />

        {refused || status === "failed" ? (
          <View className="px-5 pb-4">
            <Display variant="slip" dim={refused ? refused.dim : t("open.failedDim")} className="text-paper-ink">
              {refused ? refused.title : t("open.failedTitle")}
            </Display>
            <Text className="mt-2 font-sans text-body text-paper-ink-2">{refused ? refused.body : failureMessage}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-2.5 px-5 pb-1">
        {status === "failed" ? (
          <Button title={t("open.tryAgain")} variant="secondary" mark="▸" onPress={onRetry} />
        ) : refusal === "ORGANIZER_BLOCKED_BY_CALLER" ? (
          <>
            <Button
              title={t("refused.blocked.unblock", { organizer: organizerName })}
              mark="▸"
              onPress={onUnblockAndJoin}
              isLoading={isJoining}
            />
            <Button title={t("open.notNow")} variant="ghost" onPress={onBackToRolls} disabled={isJoining} />
          </>
        ) : refusal === "NOT_VALID" ? (
          <Button title={t("refused.scanAnother")} variant="secondary" mark="▸" onPress={onScanAnother} />
        ) : refusal ? (
          <Button title={t("open.backToEvents")} variant="secondary" mark="‹" onPress={onBackToRolls} />
        ) : (
          <>
            <Button
              title={isViewerEnvelope ? t("open.joinViewer") : t("open.joinParticipant")}
              mark="▸"
              onPress={onJoin}
              isLoading={isJoining || status === "loading"}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default JoinEnvelopeScreen;
