import { usersControllerCheckUsernameAvailability } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { UsernameAvailabilityResponseDto } from "../types";

/** `name`, when given, lets the API build suggestions from it if the username is taken. */
export const checkUsernameAvailability = async (
  username: string,
  { name, signal }: { name?: string; signal?: AbortSignal } = {},
): Promise<UsernameAvailabilityResponseDto> => {
  const { data } = await usersControllerCheckUsernameAvailability({
    query: name ? { username, name } : { username },
    signal,
    throwOnError: true,
  });
  return unwrapEnvelope(data);
};
