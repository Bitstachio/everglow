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
import { getErrorCode } from "@/lib/api/errors";
import { retryOnceOnConflict, uploadImage } from "@/lib/api/upload-image";
import type { AvatarImage } from "../lib/avatar-image";
import { profileKeys } from "./keys";
import type {
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

const uploadAvatar = (image: AvatarImage): Promise<UserResponseDto> =>
  uploadImage({
    uri: image.uri,
    contentType: image.contentType,
    tooLargeMessage: "This photo is too large to use as a profile photo.",
    mint: async (file) => {
      const { data } = await usersControllerCreateAvatarUploadUrl({ body: file, throwOnError: true });
      return unwrapEnvelope(data);
    },
    confirm: async (uploadId) => {
      const { data } = await usersControllerConfirmAvatarUpload({ body: { uploadId }, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });

/** After an avatar race that survived the retry, show whatever the other device set. */
const useRefetchUserAfterAvatarConflict = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  return async (error: unknown) => {
    if (getErrorCode(error) !== "AVATAR_CHANGED_CONCURRENTLY") return;
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
  const refetchUserAfterAvatarConflict = useRefetchUserAfterAvatarConflict();

  return useMutation<UserResponseDto, Error, AvatarImage>({
    mutationFn: uploadAvatar,
    onSuccess: (user) => {
      updateUser(user);
      queryClient.setQueryData(profileKeys.me(), user);
    },
    onError: refetchUserAfterAvatarConflict,
  });
};

export const useRemoveAvatarMutation = () => {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const refetchUserAfterAvatarConflict = useRefetchUserAfterAvatarConflict();

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
    onError: refetchUserAfterAvatarConflict,
  });
};
