import { useAuth } from "@/context/auth-context";
import { useProfileLimitsQuery } from "../api/queries";

export const useUsageScreen = () => {
  const { user } = useAuth();
  const limits = useProfileLimitsQuery(user?.id);
  return {
    limits: limits.data,
    isLoading: limits.isPending,
    isError: limits.isError,
    isFetching: limits.isFetching,
    onRetry: () => {
      void limits.refetch();
    },
  };
};
