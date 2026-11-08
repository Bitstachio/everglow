import {
  eventsControllerFindAllQueryKey,
  eventsControllerFindOneQueryKey,
  eventsControllerGetParticipantsQueryKey,
  eventsControllerListBansQueryKey,
  eventsControllerPreviewInviteQueryKey,
  photosControllerListPhotosQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const eventsKeys = {
  all: eventsControllerFindAllQueryKey(),
  list: (userId: string | undefined) => [...eventsKeys.all, { userId }] as const,
  detail: (eventId: string) => eventsControllerFindOneQueryKey({ path: { eventId } }),
  participants: (eventId: string) => eventsControllerGetParticipantsQueryKey({ path: { eventId } }),
  /** People a host removed, who can't join again until let back in (11.5). */
  bans: (eventId: string) => eventsControllerListBansQueryKey({ path: { eventId } }),
  photos: (eventId: string) => photosControllerListPhotosQueryKey({ path: { eventId } }),
  gallery: (eventId: string) => [...eventsKeys.photos(eventId), "gallery"] as const,
  /** One person's frames on a roll. Nested under `photos`, so invalidating those refreshes it. */
  personFrames: (eventId: string, userId: string) => [...eventsKeys.photos(eventId), "person", userId] as const,
  /** The envelope behind an invite token (06.4–06.13). */
  invitePreview: (token: string) => eventsControllerPreviewInviteQueryKey({ path: { token } }),
  /** A roll's first frames on Home. Nested under `photos`, so invalidating those refreshes it. */
  preview: (eventId: string, limit: number) =>
    photosControllerListPhotosQueryKey({ path: { eventId }, query: { limit } }),
};
