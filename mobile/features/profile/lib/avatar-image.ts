import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** The API's limit for avatars (`api/docs/uploads.md`). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Avatars are shown at 80pt at most; 1024px covers 3x screens with room to spare. */
export const AVATAR_MAX_DIMENSION = 1024;

export const AVATAR_CONTENT_TYPE = "image/jpeg" as const;

const JPEG_QUALITY = 0.8;

type PickedImage = {
  uri: string;
  width: number;
  height: number;
};

export type AvatarImage = {
  uri: string;
  contentType: typeof AVATAR_CONTENT_TYPE;
};

/**
 * Turns a picked photo into what the avatar API accepts: a square JPEG no
 * larger than AVATAR_MAX_DIMENSION. Re-encoding is also what makes HEIC from
 * the camera roll work, since the API only takes JPEG, PNG and WebP.
 *
 * The picker already crops to a square where the platform supports it; the
 * centre crop here covers the cases where it does not.
 */
export const prepareAvatarImage = async ({ uri, width, height }: PickedImage): Promise<AvatarImage> => {
  const side = Math.min(width, height);
  const context = ImageManipulator.manipulate(uri);

  if (width !== height) {
    context.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
  }
  if (side > AVATAR_MAX_DIMENSION) {
    context.resize({ width: AVATAR_MAX_DIMENSION, height: AVATAR_MAX_DIMENSION });
  }

  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      return { uri: result.uri, contentType: AVATAR_CONTENT_TYPE };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
};
