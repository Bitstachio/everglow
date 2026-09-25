import { usersControllerFindMeQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  storage: (userId: string | undefined) => ["profile", "storage", userId] as const,
  me: () => usersControllerFindMeQueryKey(),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
