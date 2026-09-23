import { useQuery } from "@tanstack/react-query";
import {
  eventsControllerFindAll,
  eventsControllerFindOne,
  eventsControllerGetParticipants,
  photosControllerListPhotos,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "./keys";
import type { EventParticipantResponseDto, EventResponseDto, PhotoResponseDto } from "../types";

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

export const useEventQuery = (eventId: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.detail(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async ({ signal }): Promise<EventResponseDto> => {
      const { data } = await eventsControllerFindOne({
        path: { eventId: eventId! },
        signal,
        throwOnError: true,
      });
      return unwrapEnvelope(data);
    },
  });

export const useEventPhotosQuery = (eventId: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.photos(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async ({ signal }): Promise<PhotoResponseDto[]> => {
      const { data } = await photosControllerListPhotos({
        path: { eventId: eventId! },
        signal,
        throwOnError: true,
      });
      return unwrapEnvelope(data).items;
    },
  });

export const useEventParticipantsQuery = (eventId: string | undefined) =>
  useQuery({
    queryKey: eventsKeys.participants(eventId ?? ""),
    enabled: Boolean(eventId),
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
