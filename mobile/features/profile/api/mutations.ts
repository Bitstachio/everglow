import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  usersControllerCreatePasswordChangeTicket,
  usersControllerRemoveMe,
  usersControllerUpdateMe,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { profileKeys } from "./keys";
import type { DeleteAccountPhotoPolicy, PasswordChangeTicketResponseDto, UpdateUserDto, UserResponseDto } from "../types";

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
