import sharp, { type SharpOptions } from "sharp";
import { toUndecodable, UndecodablePhotoError } from "./errors.js";

/** Fit inside this box for the gallery tile (client may still cover-crop). */
const THUMB_MAX_EDGE = 512;

/** Long edge for tap-to-view / future moderation input. */
const LARGE_MAX_EDGE = 2048;

/**
 * Refuse originals above 128 MP before decoding. That is above the 48 MP and
 * 108 MP phone sensors a 25 MB upload can hold, and bounds a decompression
 * bomb's pixel buffer (128 MP × 4 channels = 512 MB) to a third of the
 * Lambda's 1536 MB. Sharp's default is about 268 MP.
 */
export const MAX_INPUT_PIXELS = 128_000_000;

/** The photo upload API accepts JPEG, PNG, WebP and HEIC/HEIF; Sharp reports HEIC as heif. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

const INPUT_OPTIONS: SharpOptions = { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS };

export type Derivatives = {
  thumbWebp: Buffer;
  largeJpeg: Buffer;
  /** Of `largeJpeg`, after EXIF rotation. */
  width: number;
  height: number;
};

/**
 * Decode the original once: check its header, then rotate and shrink it to the
 * large box as raw pixels. Every failure here depends only on the bytes, so a
 * recognised Sharp error becomes a permanent UndecodablePhotoError.
 */
const decodeLarge = async (input: Buffer) => {
  try {
    const { format } = await sharp(input, INPUT_OPTIONS).metadata();
    if (!ACCEPTED_FORMATS.has(format)) {
      throw new UndecodablePhotoError("unsupported_format", `Input format ${format} is not an accepted photo type`);
    }
    return await sharp(input, INPUT_OPTIONS)
      .rotate()
      .resize({
        width: LARGE_MAX_EDGE,
        height: LARGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw toUndecodable(error) ?? error;
  }
};

/**
 * Build thumb + large from an original image buffer.
 * Orientation is baked in; EXIF is dropped by re-encoding.
 * The thumb is resized from the decoded large pixels, not the original.
 */
export const createDerivatives = async (input: Buffer): Promise<Derivatives> => {
  const { data, info } = await decodeLarge(input);
  const raw: SharpOptions = { raw: { width: info.width, height: info.height, channels: info.channels } };

  const [largeJpeg, thumbWebp] = await Promise.all([
    sharp(data, raw).jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
    sharp(data, raw)
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer(),
  ]);

  return { thumbWebp, largeJpeg, width: info.width, height: info.height };
};
