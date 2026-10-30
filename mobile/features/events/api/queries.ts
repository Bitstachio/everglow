import { useQuery } from "@tanstack/react-query";
import {
  eventsControllerFindAll,
  eventsControllerFindOne,
  eventsControllerGetParticipants,
  eventsControllerPreviewInvite,
  photosControllerListPhotos,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { isApiError } from "@/lib/api/errors";
import { eventsKeys } from "./keys";
import type {
  EventParticipantResponseDto,
  EventResponseDto,
  InvitePreviewResponseDto,
  PhotoResponseDto,
} from "../types";

export const useEventsQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.list(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }): Promise<EventResponseDto[]> => {
      const { data } = await eventsControllerFindAll({ signal, throwOnError: true });
      // The generated options type the envelope as one event; runtime returns an array.
      // Keep that existing schema workaround here until the OpenAPI schema is corrected.
      return unwrapEnvelope(data) as unknown as EventResponseDto[];
    },
  });

export const useEventQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: eventsKeys.detail(eventId ?? ""),
    enabled: Boolean(eventId) && enabled,
    queryFn: async ({ signal }): Promise<EventResponseDto> => {
      const { data } = await eventsControllerFindOne({
        path: { eventId: eventId! },
        signal,
        throwOnError: true,
      });
      return unwrapEnvelope(data);
    },
  });

/** The most the API returns in one page. */
const PHOTO_PAGE_SIZE = 100;

/**
 * Every photo on the roll, newest first. All pages load, since the contact
 * sheet numbers each frame by its place on the whole roll and Save all saves
 * them all.
 */
export const useEventPhotosQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: eventsKeys.photos(eventId ?? ""),
    enabled: Boolean(eventId) && enabled,
    queryFn: async ({ signal }): Promise<PhotoResponseDto[]> => {
      const photos: PhotoResponseDto[] = [];
      let cursor: string | undefined;
      do {
        const { data } = await photosControllerListPhotos({
          path: { eventId: eventId! },
          query: { limit: PHOTO_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
          signal,
          throwOnError: true,
        });
        const page = unwrapEnvelope(data);
        photos.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return photos;
    },
  });

/** The latest `limit` photos of an open roll, for its strip on Home. */
export const useRollPreviewQuery = (eventId: string, limit: number, enabled: boolean) =>
  useQuery({
    queryKey: eventsKeys.preview(eventId, limit),
    enabled,
    queryFn: async ({ signal }): Promise<PhotoResponseDto[]> => {
      const { data } = await photosControllerListPhotos({
        path: { eventId },
        query: { limit },
        signal,
        throwOnError: true,
      });
      return unwrapEnvelope(data).items;
    },
  });

export const useEventParticipantsQuery = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: eventsKeys.participants(eventId ?? ""),
    enabled: Boolean(eventId) && enabled,
    queryFn: async ({ signal }): Promise<EventParticipantResponseDto[]> => {
      const { data } = await eventsControllerGetParticipants({
        path: { eventId: eventId! },
        signal,
        throwOnError: true,
      });
      // OpenAPI currently types `data` as a single participant; runtime returns an array.
      return unwrapEnvelope(data) as unknown as EventParticipantResponseDto[];
    },
  });

/**
 * The envelope behind an invite token. Previews share join's rate limit
 * budget, so a refusal (4xx) is never retried and a return to the app doesn't
 * refetch; only a dropped connection or a server error is retried.
 */
export const useInvitePreviewQuery = (token: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.invitePreview(token ?? ""),
    enabled: Boolean(token),
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => failureCount < 2 && !(isApiError(error) && (error.status ?? 500) < 500),
    queryFn: async ({ signal }): Promise<InvitePreviewResponseDto> => {
      const { data } = await eventsControllerPreviewInvite({ path: { token: token! }, signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });
