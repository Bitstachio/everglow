/*
 * Geometry for the move-and-scale crop: the avatar's circle (02.8) and the
 * cover's 16:9 frame (04.5). The photo is laid out centred on the window, big
 * enough to cover an area around it (the screen, extended so the window is
 * its centre); the person then scales it (never below that cover) and moves
 * it, but never far enough to uncover any part of the window. The crop is the
 * window's rectangle, in photo pixels.
 */

export type Size = { width: number; height: number };

/** How far the photo is moved from the window's centre (points) and scaled on top of the cover fit. */
export type CropTransform = { scale: number; x: number; y: number };

export const MAX_CROP_SCALE = 5;

/** The scale that makes the photo cover `area`. */
export const coverScale = (photo: Size, area: Size): number =>
  Math.max(area.width / photo.width, area.height / photo.height);

/** Keeps a scale between the cover fit and MAX_CROP_SCALE. */
export const clampCropScale = (scale: number): number => {
  "worklet";
  return Math.min(Math.max(scale, 1), MAX_CROP_SCALE);
};

/**
 * Keeps an offset from uncovering the window: the photo's edge, `shown`
 * points long on one axis, may come no closer than the edge of the window,
 * `window` points long on the same axis.
 */
export const clampCropOffset = (offset: number, shown: number, window: number): number => {
  "worklet";
  const limit = Math.max((shown - window) / 2, 0);
  return Math.min(Math.max(offset, -limit), limit);
};

/** The window's rectangle in photo pixels, for ImageManipulator's crop. */
export const cropRect = (photo: Size, area: Size, window: Size, { scale, x, y }: CropTransform) => {
  const pointsPerPixel = coverScale(photo, area) * scale;
  const width = Math.min(Math.round(window.width / pointsPerPixel), photo.width);
  const height = Math.min(Math.round(window.height / pointsPerPixel), photo.height);
  // The window's top-left corner, measured from the photo's top-left, in points.
  const left = (photo.width * pointsPerPixel) / 2 - x - window.width / 2;
  const top = (photo.height * pointsPerPixel) / 2 - y - window.height / 2;
  return {
    originX: Math.min(Math.max(Math.round(left / pointsPerPixel), 0), photo.width - width),
    originY: Math.min(Math.max(Math.round(top / pointsPerPixel), 0), photo.height - height),
    width,
    height,
  };
};
