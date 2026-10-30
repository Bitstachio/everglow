import { summarizeTray, trayEntries } from "../lib/upload-tray-view";
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEventPhotosQuery, useEventQuery } from "../api/queries";
import { cancelTray, reconcileTrayPhotos, removeFromTray, retryTray, useUploadTray } from "../lib/upload-tray";

/** 08.3 / 08.5: every file in the tray and how it's doing. Leaving doesn't stop it. */
export const useUploadTrayScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(id) ? id[0] : id;

  const eventQuery = useEventQuery(eventId);
  const event = eventQuery.data ?? null;
  const visible = event?.galleryState === "OPEN" && event.status !== "SUSPENDED";
  const photosQuery = useEventPhotosQuery(eventId, visible);
  const photos = visible ? (photosQuery.data ?? []) : [];
  const tray = useUploadTray(eventId);
  useEffect(() => {
    if (eventId && visible && photosQuery.data) reconcileTrayPhotos(eventId, photosQuery.data);
  }, [eventId, visible, photosQuery.data]);

  return {
    title: event?.title ?? "",
    entries: trayEntries(tray.items, photos).map((entry) =>
      visible ? entry : { ...entry, item: { ...entry.item, uri: "" } },
    ),
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
