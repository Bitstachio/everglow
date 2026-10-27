import { useLocalSearchParams, useRouter } from "expo-router";
import { useEventPhotosQuery, useEventQuery } from "../api/queries";
import { cancelTray, removeFromTray, retryTray, summarizeTray, trayEntries, useUploadTray } from "../lib/upload-tray";

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

  return {
    title: event?.title ?? "",
    entries: trayEntries(tray.items, photos),
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
