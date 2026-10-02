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
  photosControllerConfirmUploads,
  photosControllerCreateUploadUrls,
  photosControllerFindOne,
  photosControllerRemove,
} from "@/lib/api/generated";
import type { UploadFileDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { isApiError } from "@/lib/api/errors";
import { uploadFile } from "@/lib/api/upload-file";
import { isConflict, retryOnceOnConflict, uploadImage } from "@/lib/api/upload-image";
import type { CoverImage } from "../lib/cover-image";
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

const normalizeContentType = (fileType: string): UploadFileDto["contentType"] => {
  if (fileType === "image/jpeg" || fileType === "image/png" || fileType === "image/webp") {
    return fileType;
  }
  if (fileType === "image/heic" || fileType === "image/heif") {
    return fileType;
  }
  return "image/jpeg";
};

/** Mint a slot, PUT the file to storage, confirm, then return the photo. */
const uploadEventPhoto = async (
  eventId: string,
  fileUri: string,
  _fileName: string,
  fileType: string,
): Promise<PhotoResponseDto> => {
  const slot = await uploadFile({
    uri: fileUri,
    contentType: normalizeContentType(fileType),
    mint: async (file) => {
      const { data: slotsBody } = await photosControllerCreateUploadUrls({
        path: { eventId },
        body: { files: [file] },
        throwOnError: true,
      });

      const raw = unwrapEnvelope(slotsBody);
      const slots = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
      const minted = slots[0];
      if (!minted) {
        throw new Error("No upload slot returned from the API");
      }
      return minted;
    },
  });

  await photosControllerConfirmUploads({
    path: { eventId },
    body: { photoIds: [slot.photoId] },
    throwOnError: true,
  });

  const { data } = await photosControllerFindOne({ path: { photoId: slot.photoId }, throwOnError: true });
  return unwrapEnvelope(data);
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
    mutationFn: async ({ eventId, uri, fileName, mimeType }) => uploadEventPhoto(eventId, uri, fileName, mimeType),
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
