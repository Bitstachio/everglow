import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eventsControllerCreate,
  eventsControllerJoin,
  eventsControllerLeave,
  eventsControllerRemove,
  eventsControllerRemoveParticipant,
  eventsControllerUpdate,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { deletePhoto, uploadPhoto } from "@/lib/photo";
import { eventsKeys } from "./keys";
import type { CreateEventDto, EventResponseDto, JoinEventDto, PhotoResponseDto, UpdateEventDto } from "../types";

const invalidateEventCaches = async (queryClient: ReturnType<typeof useQueryClient>, eventId?: string) => {
  await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
  if (eventId) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: eventsKeys.detail(eventId) }),
      queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) }),
      queryClient.invalidateQueries({ queryKey: eventsKeys.participants(eventId) }),
    ]);
  }
};

export const useCreateEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<EventResponseDto, Error, CreateEventDto>({
    mutationFn: async (body) => {
      const { data } = await eventsControllerCreate({ body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
};

export const useJoinEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<EventResponseDto, Error, JoinEventDto>({
    mutationFn: async (body) => {
      const { data } = await eventsControllerJoin({ body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
  });
};

export const useUpdateEventMutation = (eventId: string) => {
  const queryClient = useQueryClient();

  return useMutation<EventResponseDto, Error, UpdateEventDto>({
    mutationFn: async (body) => {
      const { data } = await eventsControllerUpdate({ path: { eventId }, body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: async () => {
      await invalidateEventCaches(queryClient, eventId);
    },
  });
};

export const useDeleteEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (eventId) => {
      await eventsControllerRemove({ path: { eventId }, throwOnError: true });
    },
    onSuccess: async (_data, eventId) => {
      await invalidateEventCaches(queryClient, eventId);
    },
  });
};

export const useLeaveEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (eventId) => {
      await eventsControllerLeave({ path: { eventId }, throwOnError: true });
    },
    onSuccess: async (_data, eventId) => {
      await invalidateEventCaches(queryClient, eventId);
    },
  });
};

export const useRemoveEventParticipantMutation = (eventId: string) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (targetUserId) => {
      await eventsControllerRemoveParticipant({ path: { eventId, targetUserId }, throwOnError: true });
    },
    onSuccess: async () => {
      await invalidateEventCaches(queryClient, eventId);
    },
  });
};

type UploadEventPhotoInput = {
  eventId: string;
  uri: string;
  fileName: string;
  mimeType: string;
};

export const useUploadEventPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<PhotoResponseDto, Error, UploadEventPhotoInput>({
    mutationFn: async ({ eventId, uri, fileName, mimeType }) => uploadPhoto(eventId, uri, fileName, mimeType),
    onSuccess: async (_data, { eventId }) => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) });
    },
  });
};

type DeleteEventPhotoInput = {
  eventId: string;
  photoId: string;
};

export const useDeleteEventPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteEventPhotoInput>({
    mutationFn: async ({ photoId }) => {
      await deletePhoto(photoId);
    },
    onSuccess: async (_data, { eventId }) => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) });
    },
  });
};
