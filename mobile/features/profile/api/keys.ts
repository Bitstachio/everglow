import {
  blocksControllerListQueryKey,
  usersControllerFindMeQueryKey,
  usersControllerGetMyLimitsQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  me: () => usersControllerFindMeQueryKey(),
  limits: () => usersControllerGetMyLimitsQueryKey(),
  blocks: () => blocksControllerListQueryKey(),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
