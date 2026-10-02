import { prepareImage, type PickedImage, type PreparedImage } from "@/lib/prepare-image";

/** Covers are cropped wide, like a banner (EV-93), and shown at this shape everywhere. */
export const COVER_ASPECT: [number, number] = [16, 9];

/** Covers span the screen width; 1920px covers 3x phones and tablets. */
export const COVER_MAX_WIDTH = 1920;

export type CoverImage = PreparedImage;

/** Turns a picked photo into what the cover API accepts: a 16:9 JPEG no wider than COVER_MAX_WIDTH. */
export const prepareCoverImage = (picked: PickedImage): Promise<CoverImage> =>
  prepareImage(picked, { aspect: COVER_ASPECT, maxWidth: COVER_MAX_WIDTH });
