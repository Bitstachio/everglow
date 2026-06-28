import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { deleteAccount } from "./profileApi";

export const useDeleteAccountMutation = () => {
  const { logout } = useAuth();

  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await logout();
    },
  });
};
