import { useRollPreviewQuery } from "../api/queries";
import { ROLL_FRAMES } from "../lib/rolls";
import type { Event } from "../types";

/** The URLs of an open roll's first photos, for its strip on Home. Other rolls have none to show. */
export const useRollPreview = (event: Event): string[] => {
  const { data: photos = [] } = useRollPreviewQuery(event.id, ROLL_FRAMES, event.galleryState === "OPEN");
  return photos.map((photo) => photo.url);
};
