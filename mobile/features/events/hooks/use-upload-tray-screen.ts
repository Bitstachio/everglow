import { useLocalSearchParams, useRouter } from "expo-router";
import { useEventPhotosQuery, useEventQuery } from "../api/queries";
import {
  cancelTray,
  developingFrames,
  removeFromTray,
  retryTray,
  summarizeTray,
  useUploadTray,
  type TrayItem,
} from "../lib/upload-tray";

/** A file in the tray with the frame number it has, or will have, on the roll. */
export type TrayEntry = { item: TrayItem; number: number | null; develop: number };

/** 08.3 / 08.5: every file in the tray and how it's doing. Leaving doesn't stop it. */
export const useUploadTrayScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;

  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;
  const photosQuery = useEventPhotosQuery(eventId, event?.galleryState === "OPEN");
  const photos = photosQuery.data ?? [];
  const tray = useUploadTray(eventId);

  const frames = new Map(developingFrames(tray.items, photos, photos.length).map((frame) => [frame.item.key, frame]));
  const entries: TrayEntry[] = tray.items.map((item) => {
    const frame = frames.get(item.key);
    return { item, number: frame?.number ?? null, develop: frame?.develop ?? 0 };
  });

  return {
    title: event?.title ?? "",
    entries,
    summary: summarizeTray(tray),
    onHide: () => (router.canGoBack() ? router.back() : eventId && router.replace(`/events/${eventId}`)),
    onCancelRest: () => {
      if (eventId) cancelTray(eventId);
    },
    onRetry: () => {
      if (eventId) retryTray(eventId);
    },
    onRemove: (key: string) => {
      if (eventId) removeFromTray(eventId, key);
    },
  };
};
