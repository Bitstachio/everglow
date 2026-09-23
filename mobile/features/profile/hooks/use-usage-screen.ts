import { useAuth } from "@/context/auth-context";
import { useProfileStorageQuery } from "../api/queries";

export const useUsageScreen = () => {
  const { user } = useAuth();
  const storage = useProfileStorageQuery(user?.id);
  return {
    storage: storage.data,
    isLoading: storage.isPending,
    isError: storage.isError,
    isFetching: storage.isFetching,
    onRetry: () => {
      void storage.refetch();
    },
  };
};
