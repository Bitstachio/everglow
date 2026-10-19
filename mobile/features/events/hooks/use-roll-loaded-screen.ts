import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useEventQuery } from "../api/queries";
import { formatEnvelopeDate } from "../lib/new-roll";
import { formatClosesOn } from "../lib/rolls";
import { inviteUrlForRole } from "../utils";

/**
 * 04.6 Loaded: the new roll's envelope, filled in and ready to send. The roll
 * comes from the cache the create filled, so it shows at once.
 */
export const useRollLoadedScreen = () => {
  const { t } = useTranslation("create");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isPending } = useEventQuery(id);

  const startsAt = event ? formatEnvelopeDate(new Date(event.date)) : "";

  return {
    isLoading: isPending,
    envelope: event
      ? {
          title: event.title,
          startsAt,
          peopleCount: event.usage.members,
          pickUpBy: event.galleryClosesAt ? formatClosesOn(event.galleryClosesAt) : undefined,
          // Guests join to add photos unless the host sends the view-only envelope (chapter 05).
          invitationUrl: inviteUrlForRole(event, "PARTICIPANT"),
          accessibilityLabel: t("envelope.a11y", { title: event.title, date: startsAt }),
        }
      : null,
    onSend: () => router.push(`/events/${id}/envelope`),
    onOpenRoll: () => router.replace(`/events/${id}`),
    onClose: () => (router.canGoBack() ? router.back() : router.replace("/events")),
  };
};
