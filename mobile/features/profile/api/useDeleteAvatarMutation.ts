import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { deleteAvatar } from "./profileApi";
import { profileKeys } from "./keys";

export const useDeleteAvatarMutation = () => {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: deleteAvatar,
    onSuccess: (data) => {
      queryClient.setQueryData(profileKeys.me(), data);
      updateUser(data);
    },
  });
};
