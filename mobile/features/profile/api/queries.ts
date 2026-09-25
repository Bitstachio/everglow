import { useQuery } from "@tanstack/react-query";
import { usersControllerCheckUsernameAvailability, usersControllerGetMyStorage } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { UsernameAvailabilityResponseDto } from "../types";
import { profileKeys } from "./keys";

export const useProfileStorageQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: profileKeys.storage(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const { data } = await usersControllerGetMyStorage({ signal, throwOnError: true });
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
