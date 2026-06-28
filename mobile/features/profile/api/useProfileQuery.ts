import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { getProfile } from "./profileApi";
import { profileKeys } from "./keys";

export const useProfileQuery = () => {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: getProfile,
    initialData: user ?? undefined,
    enabled: isAuthenticated,
  });
};
