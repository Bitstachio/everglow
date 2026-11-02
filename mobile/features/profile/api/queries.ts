import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  blocksControllerList,
  usersControllerCheckUsernameAvailability,
  usersControllerGetMyLimits,
  usersControllerPreviewDeletion,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { profileKeys } from "./keys";
import type {
  AccountDeletionPreviewResponseDto,
  BlockedUserResponseDto,
  DeleteAccountPhotoPolicy,
  UserLimitsResponseDto,
  UsernameAvailabilityResponseDto,
} from "../types";

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
export const useMyLimitsQuery = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: profileKeys.limits(),
    enabled,
    queryFn: async ({ signal }): Promise<UserLimitsResponseDto> => {
      const { data } = await usersControllerGetMyLimits({ signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });

/**
 * What deleting the account now would do to each roll it hosts alone, worked
 * out by the API running the deletion's own preparation and rolling it back.
 * The photos choice can change an outcome, so it is part of the key.
 */
export const useDeletionPreviewQuery = (photos: DeleteAccountPhotoPolicy) =>
  useQuery({
    queryKey: profileKeys.deletionPreview(photos),
    // The rows stay while the other choice is asked about, instead of blinking out.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<AccountDeletionPreviewResponseDto> => {
      const { data } = await usersControllerPreviewDeletion({ query: { photos }, signal, throwOnError: true });
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
