import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Share } from "react-native";
import { useRegenerateInviteMutation } from "../api/mutations";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import {
  ENVELOPE_KINDS,
  envelopeAccessLevel,
  envelopeUrl,
  formatEnvelopeDate,
  type EnvelopeKind,
} from "../lib/envelope";
import { formatClosesOn } from "../lib/rolls";

/**
 * 05.1–05.5 The host's envelopes: one admits people who add photos, the other
 * people who only look. Each is shared or reset on its own.
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

  const envelope =
    event && isHost
      ? {
          title: event.title,
          startsAt: formatEnvelopeDate(event.date),
          peopleCount: event.usage.members,
          pickUpBy: event.galleryClosesAt
            ? t("pickUp.until", { date: formatClosesOn(event.galleryClosesAt) })
            : t("pickUp.never"),
          admits: kind,
          note: t(`note.${kind}`),
          accessibilityLabel: t(`label.${kind}`, { title: event.title }),
        }
      : null;

  const invitationUrl = event ? envelopeUrl(event, kind) : null;

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
    invitationUrl,
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
      if (router.canGoBack()) router.back();
      else if (eventId) router.replace(`/events/${eventId}`);
    },
  };
};
