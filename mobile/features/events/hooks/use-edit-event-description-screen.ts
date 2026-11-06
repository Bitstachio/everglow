import { useEffect } from "react";
import { useEventQuery } from "../api/queries";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEditEventDescriptionForm } from "./use-edit-event-description-form";

export const useEditEventDescriptionScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;
  // Start from what's saved now: another host may have changed it since the roll was loaded.
  const { refetch } = eventQuery;
  useEffect(() => {
    if (eventId) void refetch();
  }, [eventId, refetch]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (eventId) router.replace(`/events/${eventId}/settings`);
  };

  const { form, onSubmit } = useEditEventDescriptionForm({
    eventId: eventId ?? "",
    initialDescription: event?.description ?? "",
    onSuccess: goBack,
  });

  return {
    event,
    isLoading: eventQuery.isLoading || !event,
    form,
    onSubmit,
    onBack: goBack,
  };
};
