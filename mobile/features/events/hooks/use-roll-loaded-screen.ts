import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useEventQuery } from "../api/queries";
import { envelopeUrl, formatEnvelopeDate, formatEnvelopeDay } from "../lib/envelope";

/**
 * 04.6 Loaded: the new roll's envelope, filled in and ready to send. The roll
 * comes from the cache the create filled, so it shows at once.
 */
export const useRollLoadedScreen = () => {
  const { t } = useTranslation("envelope");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isPending } = useEventQuery(id);

  return {
    isLoading: isPending,
    envelope: event
      ? {
          title: event.title,
          startsAt: formatEnvelopeDate(event.date),
          peopleCount: event.usage.members,
          pickUpBy: event.galleryClosesAt
            ? t("pickUp.until", { date: formatEnvelopeDay(event.galleryClosesAt) })
            : t("pickUp.never"),
          // Guests join to add photos unless the host sends the view-only envelope (chapter 05).
          invitationUrl: envelopeUrl(event, "adds"),
          accessibilityLabel: t("label.adds", { title: event.title }),
        }
      : null,
    onSend: () => router.push(`/events/${id}/envelope`),
    onOpenRoll: () => router.replace(`/events/${id}`),
    onClose: () => (router.canGoBack() ? router.back() : router.replace("/events")),
  };
};
