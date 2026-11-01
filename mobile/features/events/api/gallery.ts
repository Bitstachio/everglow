import { useInfiniteQuery } from "@tanstack/react-query";
import { photosControllerListPhotos } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { eventsKeys } from "./keys";
import type { PhotoResponseDto } from "../types";

/** How many frames the contact sheet asks for at a time. */
const GALLERY_PAGE_SIZE = 60;

/** One page of the contact sheet, with when its links were signed. */
export type GalleryPage = { items: PhotoResponseDto[]; nextCursor: string | null; signedAt: number };

/** A frame and when its links were signed, so a download knows whether to renew them first. */
export type SignedPhoto = { photo: PhotoResponseDto; signedAt: number };

const readPage = async (eventId: string, cursor?: string, signal?: AbortSignal): Promise<GalleryPage> => {
  const signedAt = Date.now();
  const { data } = await photosControllerListPhotos({
    path: { eventId },
    query: { limit: GALLERY_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    signal,
    throwOnError: true,
  });
  const page = unwrapEnvelope(data);
  return { items: page.items, nextCursor: page.nextCursor ?? null, signedAt };
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
export const readAllGalleryPhotos = async (eventId: string, signal: AbortSignal): Promise<SignedPhoto[]> => {
  const photos = new Map<string, SignedPhoto>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await readPage(eventId, cursor, signal);
    for (const photo of page.items) photos.set(photo.id, { photo, signedAt: page.signedAt });
    cursor = page.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error("Repeated photo cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...photos.values()];
};
