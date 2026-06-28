import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { updateProfile } from "./profileApi";
import { profileKeys } from "./keys";

export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(profileKeys.me(), data);
      updateUser(data);
    },
  });
};
