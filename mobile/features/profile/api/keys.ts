import {
  usersControllerFindMeQueryKey,
  usersControllerGetMyLimitsQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  me: () => usersControllerFindMeQueryKey(),
  limits: () => usersControllerGetMyLimitsQueryKey(),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
