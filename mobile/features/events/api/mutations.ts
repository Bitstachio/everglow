import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eventsControllerConfirmCoverUpload,
  eventsControllerCreate,
  eventsControllerCreateCoverUploadUrl,
  eventsControllerJoin,
  eventsControllerLeave,
  eventsControllerRemove,
  eventsControllerRemoveCover,
  eventsControllerRemoveParticipant,
  eventsControllerUpdate,
  photosControllerRemove,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { isApiError } from "@/lib/api/errors";
import { isConflict, retryOnceOnConflict, uploadImage } from "@/lib/api/upload-image";
import type { CoverImage } from "../lib/cover-image";
import { eventsKeys } from "./keys";
import {
  uploadEventPhotos,
  type EventPhotoFile,
  type EventPhotoUploadProgress,
  type EventPhotoUploadResult,
} from "./upload-event-photos";
import type { CreateEventDto, EventResponseDto, JoinEventDto, UpdateEventDto } from "../types";

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

type UploadEventPhotosInput = {
  eventId: string;
  files: EventPhotoFile[];
  onProgress?: (progress: EventPhotoUploadProgress) => void;
};

export const useUploadEventPhotosMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<EventPhotoUploadResult, Error, UploadEventPhotosInput>({
    mutationFn: ({ eventId, files, onProgress }) => uploadEventPhotos(eventId, files, { onProgress }),
    // Refetch the event too: its storage usage changed, and a gallery that
    // closed mid-upload has a new galleryState.
    onSettled: async (_data, _error, { eventId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventsKeys.detail(eventId) }),
      ]);
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
      await photosControllerRemove({ path: { photoId }, throwOnError: true });
    },
    onSuccess: async (_data, { eventId }) => {
      await queryClient.invalidateQueries({ queryKey: eventsKeys.photos(eventId) });
    },
  });
};

const uploadEventCover = (eventId: string, image: CoverImage): Promise<EventResponseDto> =>
  uploadImage({
    uri: image.uri,
    contentType: image.contentType,
    tooLargeMessage: "This photo is too large to use as a cover.",
    mint: async (file) => {
      const { data } = await eventsControllerCreateCoverUploadUrl({
        path: { eventId },
        body: file,
        throwOnError: true,
      });
      return unwrapEnvelope(data);
    },
    confirm: async (uploadId) => {
      const { data } = await eventsControllerConfirmCoverUpload({
        path: { eventId },
        body: { uploadId },
        throwOnError: true,
      });
      return unwrapEnvelope(data);
    },
  });

/**
 * A 409 that survived the retry means another organizer keeps changing the
 * cover, and a 403 means the caller is no longer an organizer. Either way the
 * event on screen is stale: refetch it, and the members so the settings screen
 * notices a lost role.
 */
const useRefreshEventAfterCoverError = (eventId: string) => {
  const queryClient = useQueryClient();

  return async (error: unknown) => {
    if (!isConflict(error) && !(isApiError(error) && error.status === 403)) return;
    await invalidateEventCaches(queryClient, eventId);
  };
};

export const useSetEventCoverMutation = (eventId: string) => {
  const queryClient = useQueryClient();
  const refreshEventAfterCoverError = useRefreshEventAfterCoverError(eventId);

  return useMutation<EventResponseDto, Error, CoverImage>({
    mutationFn: (image) => uploadEventCover(eventId, image),
    onSuccess: async (event) => {
      queryClient.setQueryData(eventsKeys.detail(eventId), event);
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
    onError: refreshEventAfterCoverError,
  });
};

export const useRemoveEventCoverMutation = (eventId: string) => {
  const queryClient = useQueryClient();
  const refreshEventAfterCoverError = useRefreshEventAfterCoverError(eventId);

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await retryOnceOnConflict(() => eventsControllerRemoveCover({ path: { eventId }, throwOnError: true }));
    },
    onSuccess: async () => {
      queryClient.setQueryData<EventResponseDto>(eventsKeys.detail(eventId), (event) =>
        event ? { ...event, coverUrl: null } : event,
      );
      await queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    },
    onError: refreshEventAfterCoverError,
  });
};
