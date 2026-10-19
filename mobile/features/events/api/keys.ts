import {
  eventsControllerFindAllQueryKey,
  eventsControllerFindOneQueryKey,
  eventsControllerGetParticipantsQueryKey,
  eventsControllerPreviewInviteQueryKey,
  photosControllerListPhotosQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const eventsKeys = {
  all: eventsControllerFindAllQueryKey(),
  list: (userId: string | undefined) => [...eventsKeys.all, { userId }] as const,
  detail: (eventId: string) => eventsControllerFindOneQueryKey({ path: { eventId } }),
  participants: (eventId: string) => eventsControllerGetParticipantsQueryKey({ path: { eventId } }),
  photos: (eventId: string) => photosControllerListPhotosQueryKey({ path: { eventId } }),
  /** The envelope behind an invite token (06.4–06.13). */
  invitePreview: (token: string) => eventsControllerPreviewInviteQueryKey({ path: { token } }),
  /** A roll's first frames on Home. Nested under `photos`, so invalidating those refreshes it. */
  preview: (eventId: string, limit: number) =>
    photosControllerListPhotosQueryKey({ path: { eventId }, query: { limit } }),
};
