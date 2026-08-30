import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import type { User } from "@/lib/auth";
import { deleteProfile, updateProfile } from "./requests";
import { profileKeys } from "./keys";
import type { UpdateUserDto, UserResponseDto } from "../types";

export const useUpdateProfileMutation = () => {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<UserResponseDto, Error, UpdateUserDto>({
    mutationFn: updateProfile,
    onSuccess: (user) => {
      updateUser(user as User);
      queryClient.setQueryData(profileKeys.me(), user);
    },
  });
};

export const useDeleteProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: deleteProfile,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: profileKeys.all });
    },
  });
};
