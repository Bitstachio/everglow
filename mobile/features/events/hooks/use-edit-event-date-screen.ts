import { useEventQuery } from "../api/queries";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { useEditEventDateForm } from "./use-edit-event-date-form";

export const useEditEventDateScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;
  const eventDate = event?.date;
  const initialDate = useMemo(() => (eventDate ? new Date(eventDate) : new Date()), [eventDate]);

  const { form, onSubmit } = useEditEventDateForm({
    eventId: eventId ?? "",
    initialDate,
    onSuccess: () => {
      if (router.canGoBack()) router.back();
      else if (eventId) router.replace(`/events/${eventId}/settings`);
    },
  });

  return {
    event,
    isLoading: eventQuery.isLoading || !event,
    form,
    onSubmit,
  };
};
