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

type PrepareImageOptions = {
  /** Width and height of the shape to crop to, e.g. `[16, 9]`. */
  aspect: [number, number];
  /** Downscale so the result is at most this wide. */
  maxWidth: number;
};

/**
 * Turns a picked photo into what the single-image endpoints accept: a JPEG
 * centre-cropped to `aspect` and no wider than `maxWidth`. Re-encoding is also
 * what makes HEIC from the camera roll work.
 *
 * The picker already crops to the aspect where the platform supports it; the
 * centre crop here covers the cases where it does not.
 */
export const prepareImage = async (
  { uri, width, height }: PickedImage,
  { aspect: [aspectWidth, aspectHeight], maxWidth }: PrepareImageOptions,
): Promise<PreparedImage> => {
  const ratio = aspectWidth / aspectHeight;
  const cropWidth = width / height > ratio ? Math.round(height * ratio) : width;
  const cropHeight = width / height > ratio ? height : Math.round(width / ratio);
  const context = ImageManipulator.manipulate(uri);

  if (cropWidth !== width || cropHeight !== height) {
    context.crop({
      originX: Math.floor((width - cropWidth) / 2),
      originY: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    });
  }
  if (cropWidth > maxWidth) {
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
