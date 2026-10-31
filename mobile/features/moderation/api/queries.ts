import { useQuery } from "@tanstack/react-query";
import { photosControllerFindOne } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { moderationKeys } from "./keys";

/** The frame a report is about, for its print at the top of the ticket. */
export const useReportedPhotoQuery = (photoId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.photo(photoId ?? ""),
    enabled: Boolean(photoId) && enabled,
    // Once reported it's hidden from the reporter, and a refetch would only 404.
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const { data } = await photosControllerFindOne({ path: { photoId: photoId! }, signal, throwOnError: true });
      return unwrapEnvelope(data);
    },
  });
