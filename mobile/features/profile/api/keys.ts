import { usersControllerFindMeQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  me: () => usersControllerFindMeQueryKey(),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
