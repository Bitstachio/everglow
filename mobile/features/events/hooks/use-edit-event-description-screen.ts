import { useEventQuery } from "../api/queries";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEditEventDescriptionForm } from "./use-edit-event-description-form";

export const useEditEventDescriptionScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;

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
