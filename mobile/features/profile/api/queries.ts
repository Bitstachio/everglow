import { useQuery } from "@tanstack/react-query";
import {
  blocksControllerList,
  usersControllerCheckUsernameAvailability,
  usersControllerGetMyLimits,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { profileKeys } from "./keys";
import type { BlockedUserResponseDto, UserLimitsResponseDto, UsernameAvailabilityResponseDto } from "../types";

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

/** The plan and how many rolls you're running against its limit. */
export const useMyLimitsQuery = () =>
  useQuery({
    queryKey: profileKeys.limits(),
    queryFn: async ({ signal }): Promise<UserLimitsResponseDto> => {
      const { data } = await usersControllerGetMyLimits({ signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });

/** The people you blocked, most recent first. */
export const useBlocksQuery = () =>
  useQuery({
    queryKey: profileKeys.blocks(),
    queryFn: async ({ signal }): Promise<BlockedUserResponseDto[]> => {
      const { data } = await blocksControllerList({ signal, throwOnError: true });
      return unwrapEnvelope(data).items;
    },
  });
