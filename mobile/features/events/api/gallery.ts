import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { photosControllerFindOne, photosControllerListPhotos, photosControllerRemove } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { isApiError } from "@/lib/api/errors";
import { eventsKeys } from "./keys";

const readPage = async (eventId: string, cursor?: string, signal?: AbortSignal) => {
  const { data } = await photosControllerListPhotos({
    path: { eventId },
    query: { limit: 60, ...(cursor ? { cursor } : {}) },
    signal,
    throwOnError: true,
  });
  return unwrapEnvelope(data);
};

export const useGalleryQuery = (eventId: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: eventsKeys.gallery(eventId),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => readPage(eventId, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** A deliberate bulk action reads the complete, currently visible collection. */
export const readAllGalleryPhotos = async (eventId: string, signal: AbortSignal) => {
  const photos = new Map<string, Awaited<ReturnType<typeof readPage>>["items"][number]>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await readPage(eventId, cursor, signal);
    for (const photo of page.items) photos.set(photo.id, photo);
    cursor = page.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error("Repeated photo cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...photos.values()];
};

/** Renew the signature and recheck visibility immediately before exporting. */
export const readGalleryPhoto = async (photoId: string, signal: AbortSignal) => {
  const { data } = await photosControllerFindOne({ path: { photoId }, signal, throwOnError: true });
  return unwrapEnvelope(data);
};

export const removeGalleryPhoto = async (photoId: string, signal: AbortSignal) => {
  try {
    await photosControllerRemove({ path: { photoId }, signal, throwOnError: true });
  } catch (error) {
    // Another device may already have removed it. That is the requested outcome.
    if (!isApiError(error) || error.status !== 404) throw error;
  }
};

export const useRefreshGallery = (eventId: string) => {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: eventsKeys.photos(eventId) }),
      client.invalidateQueries({ queryKey: eventsKeys.detail(eventId) }),
      client.invalidateQueries({ queryKey: eventsKeys.participants(eventId) }),
    ]);
};
