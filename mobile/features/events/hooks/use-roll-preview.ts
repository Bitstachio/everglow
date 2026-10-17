import { useRollPreviewQuery } from "../api/queries";
import { ROLL_FRAMES, type RollPhoto } from "../lib/rolls";
import type { Event } from "../types";

/** An open roll's latest photos, for its strip on Home. Other rolls have none to show. */
export const useRollPreview = (event: Event): RollPhoto[] => {
  const { data: photos = [] } = useRollPreviewQuery(event.id, ROLL_FRAMES, event.galleryState === "OPEN");
  return photos.map((photo) => ({ uri: photo.url, cacheKey: `photo:${photo.id}` }));
};
