import { useEventQuery } from "../api/queries";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEditEventTitleForm } from "./use-edit-event-title-form";

export const useEditEventTitleScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (eventId) router.replace(`/events/${eventId}/settings`);
  };

  const { form, onSubmit } = useEditEventTitleForm({
    eventId: eventId ?? "",
    initialTitle: event?.title ?? "",
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
