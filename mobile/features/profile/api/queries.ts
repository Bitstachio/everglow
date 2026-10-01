import { useQuery } from "@tanstack/react-query";
import { usersControllerCheckUsernameAvailability, usersControllerGetMyLimits } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { UsernameAvailabilityResponseDto } from "../types";
import { profileKeys } from "./keys";

export const useProfileLimitsQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: profileKeys.limits(userId),
    enabled: Boolean(userId),
    // Creating or deleting an event, in another feature, changes the counts;
    // refetch whenever a screen showing them mounts rather than wait out staleTime.
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const { data } = await usersControllerGetMyLimits({ signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });

export const checkUsernameAvailability = async (
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailabilityResponseDto> => {
  const { data } = await usersControllerCheckUsernameAvailability({
    query: { username },
    signal,
    throwOnError: true,
  });
  return unwrapEnvelope(data);
};
