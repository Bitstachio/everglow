import { useQuery } from "@tanstack/react-query";
import { usersControllerGetMyStorage } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { profileKeys } from "./keys";

export const useProfileStorageQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: profileKeys.storage(userId),
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const { data } = await usersControllerGetMyStorage({ signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });
