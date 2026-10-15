import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Avatars and covers are always re-encoded to this; the API takes JPEG, PNG and WebP (`docs/image-uploads.md`). */
export const PREPARED_IMAGE_CONTENT_TYPE = "image/jpeg" as const;

const JPEG_QUALITY = 0.8;

export type PickedImage = {
  uri: string;
  width: number;
  height: number;
};

export type PreparedImage = {
  uri: string;
  contentType: typeof PREPARED_IMAGE_CONTENT_TYPE;
};

export type CropRect = { originX: number; originY: number; width: number; height: number };

type PrepareImageOptions = {
  /** Width and height of the shape to crop to, e.g. `[16, 9]`. */
  aspect: [number, number];
  /** Downscale so the result is at most this wide. */
  maxWidth: number;
  /** The part of the photo the person chose, in pixels and already of `aspect`; the centre when left out. */
  crop?: CropRect;
};

/**
 * Turns a picked photo into what the single-image endpoints accept: a JPEG
 * cropped to `aspect` (the centre, or `crop`) and no wider than `maxWidth`.
 * Re-encoding is also what makes HEIC from the camera roll work.
 *
 * The picker already crops to the aspect where the platform supports it; the
 * centre crop here covers the cases where it does not.
 */
export const prepareImage = async (
  { uri, width, height }: PickedImage,
  { aspect: [aspectWidth, aspectHeight], maxWidth, crop }: PrepareImageOptions,
): Promise<PreparedImage> => {
  const ratio = aspectWidth / aspectHeight;
  const centreWidth = width / height > ratio ? Math.round(height * ratio) : width;
  const centreHeight = width / height > ratio ? height : Math.round(width / ratio);
  const rect = crop ?? {
    originX: Math.floor((width - centreWidth) / 2),
    originY: Math.floor((height - centreHeight) / 2),
    width: centreWidth,
    height: centreHeight,
  };
  const context = ImageManipulator.manipulate(uri);

  if (rect.width !== width || rect.height !== height) {
    context.crop(rect);
  }
  if (rect.width > maxWidth) {
    context.resize({ width: maxWidth, height: Math.round(maxWidth / ratio) });
  }

  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      return { uri: result.uri, contentType: PREPARED_IMAGE_CONTENT_TYPE };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
};
