import { Button } from "@/components/ui/button";
import { Display, Wordmark } from "@/components/ui/display";
import { FilmGrain } from "@/components/ui/film-grain";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Stamp } from "@/components/ui/stamp";
import { BackButton, TopBar } from "@/components/ui/top-bar";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { RollEnvelope } from "../components/roll-envelope";
import { useJoinEnvelopeScreen, type JoinRefusal } from "../hooks/use-join-envelope-screen";

type RefusalCopy = { stamp: string; stampSub: string; title: string; dim: string; body: string };

type RefusalFacts = { host: string | null; memberLimit: number | null; closedOn: string | null };

/** What a returned envelope says (06.8–06.13), and the stamp on it. */
const refusalCopy = (
  t: TFunction<"join">,
  refusal: JoinRefusal,
  { host, memberLimit, closedOn }: RefusalFacts,
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
          : host
            ? t("refused.full.body", { host, limit: memberLimit })
            : t("refused.full.bodyNoHost", { limit: memberLimit }),
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
      const name = host ?? t("open.theHost");
      return {
        stamp: returned,
        stampSub: t("refused.blocked.stamp"),
        title: t("refused.blocked.title", { host: name }),
        dim: t("refused.blocked.dim", { host: name }),
        body: t("refused.blocked.body", { host: name }),
      };
    }
  }
};

/**
 * 06.4–06.13 The envelope a guest opens before joining: whose roll it is,
 * who's on it, when to pick the photos up and what it admits, or, returned
 * and dimmed, why it doesn't admit them. Signed out, it's sealed (06.3).
 */
const JoinEnvelopeScreen = () => {
  const { t } = useTranslation("join");
  const {
    status,
    refusal,
    envelope,
    host,
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

  const views = envelope?.admits === "view";
  const refused = refusal ? refusalCopy(t, refusal, { host, memberLimit, closedOn }) : null;
  const hostName = host ?? t("open.theHost");
  const edge = refusal === "NOT_VALID" ? t("refused.edgeNotValid") : refusal ? envelope?.title : undefined;

  if (status === "sealed") {
    return (
      <SafeAreaView className="flex-1 bg-ground">
        <View className="h-11 flex-row items-center px-5">
          <Wordmark />
        </View>
        <View className="flex-1">
          <View className="mx-7.5 mt-4 scale-86">
            <RollEnvelope
              title=""
              sealed
              stamp={<Stamp title={t("sealed.stamp")} subtitle={t("sealed.stampSub")} />}
              accessibilityLabel={t("sealed.label")}
            />
          </View>
          <View className="mt-auto px-5 pb-4">
            <Display variant="slip" dim={t("sealed.dim")}>
              {t("sealed.title")}
            </Display>
            <Text className="mt-2 font-sans text-body text-text-2">{t("sealed.body")}</Text>
          </View>
        </View>
        <View className="px-5 pb-1">
          <Button title={t("sealed.signIn")} mark="▸" onPress={onSignIn} isLoading={isSigningIn} />
        </View>
        <FilmGrain />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ground">
      <TopBar title={edge} left={<BackButton accessibilityLabel={t("open.back")} onPress={onBack} />} />

      <View className="flex-1">
        <View className="mx-7.5 mt-2.5">
          <RollEnvelope
            dimmed={status !== "ready"}
            title={envelope?.title ?? ""}
            startsAt={envelope?.startsAt}
            peopleCount={envelope?.peopleCount}
            pickUpBy={envelope?.pickUpBy}
            admits={envelope?.admits ?? (refusal === "NOT_VALID" ? "adds" : undefined)}
            // What joining gets them, pencilled under the ticked box. No code: there's nothing to scan here.
            note={status === "ready" && envelope ? t(`open.note.${envelope.admits}`) : undefined}
            stamp={
              refused ? (
                <Stamp title={refused.stamp} subtitle={refused.stampSub} tone="pencil" />
              ) : status === "ready" ? (
                <Stamp title={t("open.stamp")} subtitle={t("open.stampBy", { host: hostName })} />
              ) : undefined
            }
            accessibilityLabel={envelope ? t("envelope.label", { title: envelope.title }) : t("envelope.labelLoading")}
          />
        </View>

        {refused || status === "failed" ? (
          <View className="mt-auto px-5 pb-4">
            <Display variant="slip" dim={refused ? refused.dim : t("open.failedDim")}>
              {refused ? refused.title : t("open.failedTitle")}
            </Display>
            <Text className="mt-2 font-sans text-body text-text-2">{refused ? refused.body : failureMessage}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-2.5 px-5 pb-1">
        {status === "failed" ? (
          <Button title={t("open.tryAgain")} variant="secondary" mark="▸" onPress={onRetry} />
        ) : refusal === "ORGANIZER_BLOCKED_BY_CALLER" ? (
          <>
            <Button
              title={t("refused.blocked.unblock", { host: hostName })}
              mark="▸"
              onPress={onUnblockAndJoin}
              isLoading={isJoining}
            />
            <Button title={t("open.notNow")} variant="ghost" onPress={onBackToRolls} disabled={isJoining} />
          </>
        ) : refusal === "NOT_VALID" ? (
          <Button title={t("refused.scanAnother")} variant="secondary" mark="▸" onPress={onScanAnother} />
        ) : refusal ? (
          <Button title={t("open.backToRolls")} variant="secondary" mark="‹" onPress={onBackToRolls} />
        ) : (
          <>
            <Button
              title={views ? t("open.joinView") : t("open.joinAdds")}
              mark="▸"
              onPress={onJoin}
              isLoading={isJoining || status === "loading"}
            />
          </>
        )}
      </View>
      <FilmGrain />
    </SafeAreaView>
  );
};

export default JoinEnvelopeScreen;
