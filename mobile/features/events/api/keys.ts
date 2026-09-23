import {
  eventsControllerFindAllQueryKey,
  eventsControllerFindOneQueryKey,
  eventsControllerGetParticipantsQueryKey,
  photosControllerListPhotosQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const eventsKeys = {
  all: eventsControllerFindAllQueryKey(),
  list: (userId: string | undefined) => [...eventsKeys.all, { userId }] as const,
  detail: (eventId: string) => eventsControllerFindOneQueryKey({ path: { eventId } }),
  participants: (eventId: string) => eventsControllerGetParticipantsQueryKey({ path: { eventId } }),
  photos: (eventId: string) => photosControllerListPhotosQueryKey({ path: { eventId } }),
};
