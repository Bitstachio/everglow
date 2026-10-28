import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Share } from "react-native";
import { useRegenerateInviteMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import {
  closedOn,
  ENVELOPE_KINDS,
  envelopeAccessLevel,
  envelopeState,
  envelopeUrl,
  formatEnvelopeDate,
  formatEnvelopeDay,
  type EnvelopeKind,
} from "../lib/envelope";

/**
 * 05.1–05.7 The host's envelopes: one admits people who add photos, the other
 * people who only look. Each is shared or reset on its own while the
 * roll is open; a closed or on-hold roll shows why no one new can come in.
 */
export const useEnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const router = useRouter();
  const { id, ready } = useLocalSearchParams<{ id: string; ready?: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  // Opened straight after loading a new roll (04.5): stamped Ready, and closing goes on to the roll.
  const justLoaded = ready === "1";
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const regenerate = useRegenerateInviteMutation(eventId ?? "");
  const [kind, setKind] = useState<EnvelopeKind>("adds");
  const [resetVisible, setResetVisible] = useState(false);
  // Which envelope the reset slip will reset: the one on the table unless the host picks the other.
  const [resetKind, setResetKind] = useState<EnvelopeKind>("adds");

  const event = eventQuery.data;
  const isLoading = eventQuery.isLoading || participantsQuery.isLoading;
  const isError = eventQuery.isError || participantsQuery.isError;

  // Only hosts hold the envelopes; the API lists invites for no one else.
  const role = participantsQuery.data?.find((participant) => participant.userId === user?.id)?.accessLevel;
  const isHost = role === "ORGANIZER";
  const notHost = participantsQuery.isSuccess && !isHost;
  useEffect(() => {
    if (notHost && eventId) router.replace(`/events/${eventId}`);
  }, [notHost, eventId, router]);

  const state = event ? envelopeState(event) : "open";
  const isOpen = state === "open";
  // Shut, the adds-photos envelope stays on the table without its code (05.6–05.7).
  const shown: EnvelopeKind = isOpen ? kind : "adds";

  const pickUpBy = () => {
    if (!event) return undefined;
    if (state === "closed") return t("pickUp.gone", { date: formatEnvelopeDay(closedOn(event)) });
    return event.galleryClosesAt
      ? t("pickUp.until", { date: formatEnvelopeDay(event.galleryClosesAt) })
      : t("pickUp.never");
  };

  const envelope =
    event && isHost
      ? {
          title: event.title,
          startsAt: formatEnvelopeDate(event.date),
          peopleCount: event.usage.members,
          pickUpBy: pickUpBy(),
          admits: shown,
          // A closed or held envelope admits nobody, so there is nothing to pencil in.
          note: isOpen ? t(`note.${shown}`) : undefined,
          accessibilityLabel: t(`label.${shown}`, { title: event.title }),
        }
      : null;

  const invitationUrl = event && isOpen ? envelopeUrl(event, kind) : null;

  const shut =
    event && state !== "open"
      ? {
          state,
          stamp: t(`${state}.stamp`),
          stampLine: t(`${state}.stampLine`),
          date: state === "closed" ? formatEnvelopeDay(closedOn(event)) : undefined,
        }
      : null;

  const onShare = async () => {
    if (!event || !invitationUrl) return;
    try {
      await Share.share({ message: t("share.message", { title: event.title, url: invitationUrl }) });
    } catch (error) {
      Alert.alert(t("share.failedTitle"), getErrorMessage(error));
    }
  };

  const onConfirmReset = async () => {
    try {
      await regenerate.mutateAsync(envelopeAccessLevel(resetKind));
      setResetVisible(false);
      // Show the envelope that was reset, with its new code.
      setKind(resetKind);
    } catch (error) {
      setResetVisible(false);
      Alert.alert(t("reset.failedTitle"), getErrorMessage(error));
    }
  };

  return {
    edge: event ? t("edge", { title: event.title }) : null,
    envelope,
    readyStamp: justLoaded && state === "open" ? t("ready") : null,
    invitationUrl,
    state,
    shut,
    kind,
    isLoading,
    isError,
    reset: {
      visible: resetVisible,
      choice: resetKind,
      choices: ENVELOPE_KINDS.map((key) => ({
        key,
        title: t(`reset.choice.${key}.title`),
        description: t(`reset.choice.${key}.description`),
      })),
      body: t("reset.body", { count: event?.usage.members ?? 0 }),
      isResetting: regenerate.isPending,
    },
    onSelectKind: setKind,
    onShare,
    onReset: () => {
      setResetKind(kind);
      setResetVisible(true);
    },
    onSelectResetKind: setResetKind,
    onCloseReset: () => {
      if (!regenerate.isPending) setResetVisible(false);
    },
    onConfirmReset,
    onRetry: () => {
      void eventQuery.refetch();
      void participantsQuery.refetch();
    },
    onClose: () => {
      if (justLoaded && eventId) router.replace(`/events/${eventId}`);
      else if (router.canGoBack()) router.back();
      else if (eventId) router.replace(`/events/${eventId}`);
    },
  };
};
