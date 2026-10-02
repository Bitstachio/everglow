import { prepareImage, type PickedImage, type PreparedImage } from "@/lib/prepare-image";

/** Avatars are shown at 80pt at most; 1024px covers 3x screens with room to spare. */
export const AVATAR_MAX_DIMENSION = 1024;

export type AvatarImage = PreparedImage;

/**
 * Turns a picked photo into what the avatar API accepts: a square JPEG no
 * larger than AVATAR_MAX_DIMENSION.
 */
export const prepareAvatarImage = (picked: PickedImage): Promise<AvatarImage> =>
  prepareImage(picked, { aspect: [1, 1], maxWidth: AVATAR_MAX_DIMENSION });
