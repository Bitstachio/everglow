import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Clipboard, Share } from "react-native";
import { useRegenerateInviteMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import {
  closedOn,
  envelopeAccessLevel,
  envelopeState,
  envelopeUrl,
  formatEnvelopeDate,
  formatEnvelopeDay,
  type EnvelopeKind,
} from "../lib/envelope";

/** How long Copy link reads "Copied". */
const COPIED_MS = 2000;

/**
 * 05.1–05.7 The host's envelopes: one admits people who add photos, the other
 * people who only look. Each is shared, copied or reset on its own while the
 * roll is open; a closed or on-hold roll shows why no one new can come in.
 */
export const useEnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const regenerate = useRegenerateInviteMutation(eventId ?? "");
  const [kind, setKind] = useState<EnvelopeKind>("adds");
  const [resetVisible, setResetVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

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

  const onCopy = () => {
    if (!invitationUrl) return;
    Clipboard.setString(invitationUrl);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const onConfirmReset = async () => {
    try {
      await regenerate.mutateAsync(envelopeAccessLevel(kind));
      setResetVisible(false);
    } catch (error) {
      setResetVisible(false);
      Alert.alert(t("reset.failedTitle"), getErrorMessage(error));
    }
  };

  return {
    edge: event ? t("edge", { title: event.title }) : null,
    envelope,
    invitationUrl,
    state,
    shut,
    kind,
    isLoading,
    isError,
    copied,
    reset: {
      visible: resetVisible,
      edge: t(`reset.edge.${kind}`),
      body: t("reset.body", { count: event?.usage.members ?? 0, other: t(`reset.other.${kind}`) }),
      a11y: t(`reset.a11y.${kind}`),
      isResetting: regenerate.isPending,
    },
    onSelectKind: (next: EnvelopeKind) => {
      setKind(next);
      setCopied(false);
    },
    onShare,
    onCopy,
    onReset: () => setResetVisible(true),
    onCloseReset: () => {
      if (!regenerate.isPending) setResetVisible(false);
    },
    onConfirmReset,
    onRetry: () => {
      void eventQuery.refetch();
      void participantsQuery.refetch();
    },
    onClose: () => {
      if (router.canGoBack()) router.back();
      else if (eventId) router.replace(`/events/${eventId}`);
    },
  };
};
