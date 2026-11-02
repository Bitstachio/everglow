import {
  blocksControllerListQueryKey,
  usersControllerFindMeQueryKey,
  usersControllerGetMyLimitsQueryKey,
  usersControllerPreviewDeletionQueryKey,
} from "@/lib/api/generated/@tanstack/react-query.gen";

export const profileKeys = {
  me: () => usersControllerFindMeQueryKey(),
  limits: () => usersControllerGetMyLimitsQueryKey(),
  blocks: () => blocksControllerListQueryKey(),
  deletionPreview: (photos: "KEEP" | "DELETE") => usersControllerPreviewDeletionQueryKey({ query: { photos } }),
  usernameAvailability: (username: string) => ["profile", "username-availability", username] as const,
};
