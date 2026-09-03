import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usersControllerRemoveMe, usersControllerUpdateMe } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { profileKeys } from "./keys";
import type { UpdateUserDto, UserResponseDto } from "../types";

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

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await usersControllerRemoveMe({ throwOnError: true });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: profileKeys.all });
    },
  });
};
