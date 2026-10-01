import { usersControllerCheckUsernameAvailability } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { UsernameAvailabilityResponseDto } from "../types";

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
