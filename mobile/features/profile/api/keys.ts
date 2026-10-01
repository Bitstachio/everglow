import { usersControllerFindMeQueryKey } from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  all: ["profile"] as const,
  limits: (userId: string | undefined) => ["profile", "limits", userId] as const,
  me: () => usersControllerFindMeQueryKey(),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
