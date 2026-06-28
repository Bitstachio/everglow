import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { uploadAvatar } from "./profileApi";
import { profileKeys } from "./keys";

export const useUploadAvatarMutation = () => {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (data) => {
      queryClient.setQueryData(profileKeys.me(), data);
      updateUser(data);
    },
  });
};
