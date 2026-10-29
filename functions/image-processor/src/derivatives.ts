import sharp from "sharp";

/** Fit inside this box for the gallery tile (client may still cover-crop). */
const THUMB_MAX_EDGE = 512;

/** Long edge for tap-to-view / future moderation input. */
const LARGE_MAX_EDGE = 2048;

export type Derivatives = {
  thumbWebp: Buffer;
  largeJpeg: Buffer;
  width: number;
  height: number;
};

/**
 * Build thumb + large from an original image buffer.
 * Orientation is baked in; EXIF is dropped by re-encoding.
 */
export const createDerivatives = async (input: Buffer): Promise<Derivatives> => {
  const image = sharp(input, { failOn: "error" }).rotate();
  const metadata = await image.metadata();

  const thumbWebp = await image
    .clone()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();

  const largeJpeg = await image
    .clone()
    .resize({
      width: LARGE_MAX_EDGE,
      height: LARGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return {
    thumbWebp,
    largeJpeg,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
};
