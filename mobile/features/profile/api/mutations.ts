import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  usersControllerConfirmAvatarUpload,
  usersControllerCreateAvatarUploadUrl,
  usersControllerCreatePasswordChangeTicket,
  usersControllerFindMe,
  usersControllerRemoveAvatar,
  usersControllerRemoveMe,
  usersControllerUpdateMe,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { createApiError, getErrorCode, isApiError } from "@/lib/api/errors";
import { uploadFile, type UploadFileDeclaration } from "@/lib/api/upload-file";
import { AVATAR_MAX_BYTES, type AvatarImage } from "../lib/avatar-image";
import { profileKeys } from "./keys";
import type {
  CreateImageUploadDto,
  DeleteAccountPhotoPolicy,
  PasswordChangeTicketResponseDto,
  UpdateUserDto,
  UserResponseDto,
} from "../types";

export const useUpdateProfileMutation = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<UserResponseDto, Error, UpdateUserDto>({
    mutationFn: async (body) => {
      const { data } = await usersControllerUpdateMe({ body, throwOnError: true });
      return unwrapEnvelope(data);
    },
    onSuccess: (user) => {
      updateUser(user);
      queryClient.setQueryData(profileKeys.me(), user);
    },
  });
};

export const useDeleteProfileMutation = () => {
  const queryClient = useQueryClient();

  // `photos` is required by the API: KEEP leaves the photos in the events they
  // were added to with the uploader removed, DELETE removes them everywhere.
  // Both are irreversible, so the caller has to say which one it wants.
  return useMutation<void, Error, DeleteAccountPhotoPolicy>({
    mutationFn: async (photos) => {
      await usersControllerRemoveMe({ query: { photos }, throwOnError: true });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: profileKeys.all });
    },
  });
};

export const useCreatePasswordChangeTicketMutation = () => {
  return useMutation<PasswordChangeTicketResponseDto, Error, void>({
    mutationFn: async () => {
      const { data } = await usersControllerCreatePasswordChangeTicket({ throwOnError: true });
      return unwrapEnvelope(data);
    },
  });
};

/** The object never arrived or was the wrong type or size; the ticket is spent and a new URL is needed. */
const START_OVER_CODES = new Set(["IMAGE_UPLOAD_EXPIRED", "IMAGE_UPLOAD_REJECTED"]);
const MAX_AVATAR_UPLOAD_ATTEMPTS = 2;

const isConflict = (error: unknown) => isApiError(error) && error.status === 409;

/**
 * Avatar writes are conditional on the avatar the server last read, so a change
 * from another device in between is a 409. The server reads again on every
 * request, so one retry applies this change on top of the other one.
 */
const retryOnceOnConflict = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    if (!isConflict(error)) throw error;
    return request();
  }
};

const mintAvatarUpload = async (file: UploadFileDeclaration<CreateImageUploadDto["contentType"]>) => {
  if (file.sizeBytes > AVATAR_MAX_BYTES) {
    throw createApiError("This photo is too large to use as a profile photo.", { code: "IMAGE_INVALID_SIZE" });
  }
  const { data } = await usersControllerCreateAvatarUploadUrl({ body: file, throwOnError: true });
  return unwrapEnvelope(data);
};

const confirmAvatarUpload = async (uploadId: string): Promise<UserResponseDto> => {
  const { data } = await usersControllerConfirmAvatarUpload({ body: { uploadId }, throwOnError: true });
  return unwrapEnvelope(data);
};

const uploadAvatar = async (image: AvatarImage): Promise<UserResponseDto> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { uploadId } = await uploadFile({ uri: image.uri, contentType: image.contentType, mint: mintAvatarUpload });
      return await retryOnceOnConflict(() => confirmAvatarUpload(uploadId));
    } catch (error) {
      const code = getErrorCode(error);
      if (attempt >= MAX_AVATAR_UPLOAD_ATTEMPTS || !code || !START_OVER_CODES.has(code)) throw error;
    }
  }
};

/** After a conflict that survived the retry, show whatever the other device set. */
const useRefetchUserAfterConflict = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  return async (error: unknown) => {
    if (!isConflict(error)) return;
    try {
      const { data } = await usersControllerFindMe({ throwOnError: true });
      const user = unwrapEnvelope(data);
      updateUser(user);
      queryClient.setQueryData(profileKeys.me(), user);
    } catch {
      // The original error is what the user needs to see; a failed refresh adds nothing.
    }
  };
};

export const useSetAvatarMutation = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();
  const refetchUserAfterConflict = useRefetchUserAfterConflict();

  return useMutation<UserResponseDto, Error, AvatarImage>({
    mutationFn: uploadAvatar,
    onSuccess: (user) => {
      updateUser(user);
      queryClient.setQueryData(profileKeys.me(), user);
    },
    onError: refetchUserAfterConflict,
  });
};

export const useRemoveAvatarMutation = () => {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const refetchUserAfterConflict = useRefetchUserAfterConflict();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await retryOnceOnConflict(() => usersControllerRemoveAvatar({ throwOnError: true }));
    },
    onSuccess: () => {
      if (!user?.details) return;
      const updated = { ...user, details: { ...user.details, avatarUrl: null } };
      updateUser(updated);
      queryClient.setQueryData(profileKeys.me(), updated);
    },
    onError: refetchUserAfterConflict,
  });
};
