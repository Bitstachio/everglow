import { useUnblockMutation } from "@/features/profile/api/mutations";
import { getErrorCode, getErrorMessage, isApiError } from "@/lib/api/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useJoinEventMutation } from "../api/mutations";
import { useInvitePreviewQuery } from "../api/queries";
import { firstName, formatEnvelopeDate, formatPickUpDate } from "../lib/invite";
import type { InvitePreviewState } from "../types";

/** Why an envelope doesn't admit the caller (06.8–06.13): a preview state, or a link that doesn't open. */
export type JoinRefusal = Exclude<InvitePreviewState, "JOINABLE" | "ALREADY_A_MEMBER"> | "NOT_VALID";

/** Join refusals the preview describes better than the error: fetch it again and show what it says now. */
const REFUSAL_CODES: readonly string[] = [
  "ALREADY_A_MEMBER",
  "EVENT_GALLERY_CLOSED",
  "REMOVED_FROM_EVENT",
  "EVENT_SUSPENDED",
  "EVENT_UNDER_REVIEW",
  "ORGANIZER_BLOCKED_BY_CALLER",
  "EVENT_MEMBER_LIMIT_REACHED",
];

const isNotFound = (error: unknown) => isApiError(error) && error.status === 404;

/** Home: back down the stack when it's there, in this screen's place when a link opened the app. */
const backToRolls = () => router.dismissTo("/events");

/**
 * 06.4–06.13 The envelope a guest opens. It shows what the invite leads to
 * and joins it; someone already on the roll goes straight in (06.7), and a
 * join lands on the roll with a note saying which member they are (06.6).
 * When the envelope doesn't admit them, it says why (06.8–06.13).
 */
export const useJoinEnvelopeScreen = () => {
  const { t } = useTranslation("join");
  const params = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const preview = useInvitePreviewQuery(token);
  const join = useJoinEventMutation();
  const unblock = useUnblockMutation();
  const data = preview.data;

  const alreadyIn = data?.state === "ALREADY_A_MEMBER" ? data.eventId : null;
  useEffect(() => {
    if (alreadyIn) router.replace({ pathname: "/events/[id]", params: { id: alreadyIn, arrival: "already" } });
  }, [alreadyIn]);

  const refusal = ((): JoinRefusal | null => {
    if (isNotFound(preview.error)) return "NOT_VALID";
    if (!data || data.state === "JOINABLE" || data.state === "ALREADY_A_MEMBER") return null;
    return data.state;
  })();

  const status = ((): "loading" | "ready" | "refused" | "failed" => {
    if (refusal) return "refused";
    if (data && !alreadyIn) return "ready";
    if (preview.isError) return "failed";
    return "loading";
  })();

  const joinNow = () => {
    if (!token) return;
    join.mutate(
      { invitationUrl: token },
      {
        onSuccess: (event) =>
          router.replace({
            pathname: "/events/[id]",
            params: { id: event.id, arrival: "joined", place: String(event.usage.members) },
          }),
        onError: (error) => {
          // The roll changed since the envelope opened: show it as it is now.
          if (isNotFound(error) || REFUSAL_CODES.includes(getErrorCode(error) ?? "")) {
            void preview.refetch();
            return;
          }
          Alert.alert(t("open.joinFailed"), getErrorMessage(error));
        },
      },
    );
  };

  const busy = join.isPending || unblock.isPending;

  return {
    status,
    refusal,
    envelope: data
      ? {
          title: data.title,
          startsAt: formatEnvelopeDate(data.date),
          peopleCount: data.memberCount,
          pickUpBy: data.galleryClosesAt
            ? t("envelope.pickUp", { date: formatPickUpDate(data.galleryClosesAt) })
            : undefined,
          admits: data.accessLevel === "VIEWER" ? ("view" as const) : ("adds" as const),
          invitationUrl: data.invitationUrl,
        }
      : null,
    /** The host by first name, or null when their profile is gone. */
    host: data?.host?.name ? firstName(data.host.name) : null,
    memberLimit: data?.memberLimit ?? null,
    closedOn: data?.galleryClosesAt ? formatPickUpDate(data.galleryClosesAt) : null,
    failureMessage: preview.isError ? getErrorMessage(preview.error) : null,
    isJoining: busy,
    onJoin: () => {
      if (!busy) joinNow();
    },
    // 06.13: the block is the caller's own, so lifting it is theirs too. Silent either way.
    onUnblockAndJoin: () => {
      const hostId = data?.host?.userId;
      if (busy || !hostId) return;
      unblock.mutate(hostId, {
        onSuccess: joinNow,
        onError: (error) => Alert.alert(t("refused.blocked.unblockFailed"), getErrorMessage(error)),
      });
    },
    onRetry: () => void preview.refetch(),
    onBack: () => (router.canGoBack() ? router.back() : backToRolls()),
    onBackToRolls: backToRolls,
  };
};
