import { useAuth } from "@/context/auth-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEventParticipantsQuery, useEventQuery } from "../api/queries";
import { envelopeUrl, formatEnvelopeDate, type EnvelopeKind } from "../lib/envelope";
import { formatClosesOn } from "../lib/rolls";

/** 05.1–05.2 The host's envelopes: one admits people who add photos, the other people who only look. */
export const useEnvelopeScreen = () => {
  const { t } = useTranslation("envelope");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();

  const eventQuery = useEventQuery(eventId);
  const participantsQuery = useEventParticipantsQuery(eventId);
  const [kind, setKind] = useState<EnvelopeKind>("adds");

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

  return {
    edge: event ? t("edge", { title: event.title }) : null,
    envelope,
    invitationUrl: event ? envelopeUrl(event, kind) : null,
    kind,
    isLoading,
    isError,
    onSelectKind: setKind,
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
