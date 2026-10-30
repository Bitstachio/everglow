import { summarizeTray } from "../lib/upload-tray-view";
import { useCallback, useEffect } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useEventPhotosQuery, useEventQuery } from "../api/queries";
import {
  cancelTray,
  openTraySession,
  reconcileTrayPhotos,
  removeFromTray,
  retryTray,
  useUploadTraySession,
} from "../lib/upload-tray";

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
  const thumbnails = new Map(photos.map((photo) => [photo.id, photo.thumbnailUrl]));
  useFocusEffect(useCallback(() => (eventId ? openTraySession(eventId) : undefined), [eventId]));
  const tray = useUploadTraySession(eventId);
  useEffect(() => {
    if (eventId && visible && photosQuery.data) reconcileTrayPhotos(eventId, photosQuery.data);
  }, [eventId, visible, photosQuery.data]);

  return {
    title: event?.title ?? "",
    entries: tray.items.map((item) => {
      const status = item.status;
      const thumbnail = status.kind === "developed" ? thumbnails.get(status.photoId) : undefined;
      // The roll can release a completed local file once its thumbnail loads.
      const previewable = visible && !(status.kind === "rejected" && status.reason === "video");
      return { ...item, uri: previewable ? (thumbnail ?? item.uri) : "" };
    }),
    summary: summarizeTray(tray),
    onHide: () => (router.canGoBack() ? router.back() : eventId && router.replace(`/events/${eventId}`)),
    onCancelRest: () => {
      if (eventId) cancelTray(eventId);
    },
    onRetry: () => {
      if (eventId) retryTray(eventId);
    },
    onRetryOne: (key: string) => {
      if (eventId) retryTray(eventId, undefined, false, key);
    },
    onRemove: (key: string) => {
      if (eventId) removeFromTray(eventId, key);
    },
  };
};
