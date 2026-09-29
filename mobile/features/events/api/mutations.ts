import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eventsControllerCreate,
  eventsControllerJoin,
  eventsControllerLeave,
  eventsControllerRemove,
  eventsControllerRemoveParticipant,
  eventsControllerUpdate,
  photosControllerConfirmUploads,
  photosControllerCreateUploadUrls,
  photosControllerFindOne,
  photosControllerRemove,
} from "@/lib/api/generated";
import type { UploadFileDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
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
  const contentType = normalizeContentType(fileType);

  // The upload URL is signed for an exact Content-Length, so the size must be
  // that of the bytes we send. The picker's fileSize can describe the original
  // photo rather than the cropped, re-encoded file, which S3 rejects with 403.
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  if (blob.size <= 0) {
    throw new Error("Could not determine file size for upload");
  }

  const { data: slotsBody } = await photosControllerCreateUploadUrls({
    path: { eventId },
    body: { files: [{ contentType, sizeBytes: blob.size }] },
    throwOnError: true,
  });

  const raw = unwrapEnvelope(slotsBody);
  const slots = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const slot = slots[0];
  if (!slot) {
    throw new Error("No upload slot returned from the API");
  }

  // Expo's fetch sends a Blob body with the blob's own type as Content-Type,
  // overriding the header below. A blob read from a file:// URI has an empty
  // type, so S3 sees "content-type:" and rejects the signed URL with 403.
  // slice() gives a typed view of the same bytes without copying them.
  const typedBlob = blob.slice(0, blob.size, contentType);

  const uploadResponse = await fetch(slot.uploadUrl, {
    body: typedBlob,
    headers: { "Content-Type": contentType },
    method: "PUT",
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

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
