import { useRollPreviewQuery } from "../api/queries";
import { ROLL_FRAMES, toRollPhotos, type RollPhoto } from "../lib/rolls";
import type { Event } from "../types";

/** An open roll's latest photos, for its strip on Home. Other rolls have none to show. */
export const useRollPreview = (event: Event): RollPhoto[] => {
  const enabled = event.galleryState === "OPEN" && event.status !== "SUSPENDED";
  const { data: photos = [] } = useRollPreviewQuery(event.id, ROLL_FRAMES, enabled);
  // Disabled queries retain cached data; hidden rolls must not render that old data.
  return enabled ? toRollPhotos(photos) : [];
};
